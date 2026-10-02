import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import type { AnyNode, Element } from 'domhandler';

export interface ExtractedPage {
  title: string;
  /** Markdown-like text: `#` headings, `- ` list items, one block per line. */
  content: string;
}

/** Where the page body lives, in order of preference. */
const ROOT_SELECTORS = ['main', '#__next', 'body'];

/** Site furniture that never belongs to the page's own content. */
const REMOVE_SELECTORS = [
  'script',
  'style',
  'noscript',
  'svg',
  'iframe',
  'template',
  'header',
  'footer',
  'nav',
  'form',
  'input',
  'select',
  'textarea',
  'button',
  '[role="dialog"]',
  '[aria-hidden="true"]',
  '.breadcrumb',
  '.hidden-element',
  '.header-sticky',
  '.top-header',
  '[class*="cookie"]',
  '[class*="sidenav"]',
  '[class*="drawer"]',
  '[class*="show-on-map"]',
  '.switcher',
  '.switch-item',
  '[class*="toggler"]',
  '[class*="search"]',
  '[class*="legend"]',
  '[class*="skeleton"]',
];

const BLOCK_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'dd',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'main',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
]);

const HEADING_RE = /^h([1-6])$/;
/** A non-heading element whose class marks it as a title is promoted to this level. */
const PROMOTED_TITLE_LEVEL = 3;
const MAX_PROMOTED_TITLE_CHARS = 140;

/**
 * Converts the DOM of a rendered page into compact, markdown-like text that
 * keeps the structure the chunker relies on (headings, list items, paragraphs)
 * and drops everything that is site furniture rather than page content.
 */
@Injectable()
export class HtmlTextExtractor {
  extract(html: string): ExtractedPage {
    const $ = cheerio.load(html);
    const title = cleanTitle($('title').first().text());

    let root: cheerio.Cheerio<AnyNode> | null = null;
    for (const selector of ROOT_SELECTORS) {
      const found = $(selector).first();
      if (found.length) {
        root = found;
        break;
      }
    }
    if (!root) {
      return { title, content: '' };
    }

    root.find(REMOVE_SELECTORS.join(',')).remove();

    const lines: string[] = [];
    const paragraph: string[] = [];

    const flush = () => {
      const text = normalizeInline(paragraph.join(' '));
      paragraph.length = 0;
      if (text) lines.push(text);
    };

    const walk = (node: AnyNode, listDepth: number) => {
      if (node.type === 'text') {
        paragraph.push(node.data ?? '');
        return;
      }
      if (node.type !== 'tag' && node.type !== 'root') {
        return;
      }
      const el = node as Element;
      const tag = (el.name ?? '').toLowerCase();

      if (tag === 'br') {
        paragraph.push(' ');
        return;
      }

      const headingMatch = HEADING_RE.exec(tag);
      if (headingMatch) {
        flush();
        const text = normalizeInline($(el).text());
        if (text) lines.push(`${'#'.repeat(Number(headingMatch[1]))} ${text}`);
        return;
      }

      if (tag === 'li') {
        flush();
        if (hasBlockChildren(el)) {
          for (const child of el.children) walk(child, listDepth + 1);
          flush();
        } else {
          const text = normalizeInline($(el).text());
          if (text) lines.push(`- ${text}`);
        }
        return;
      }

      if (isPromotedTitle(el) && !hasBlockChildren(el)) {
        flush();
        const text = normalizeInline($(el).text());
        if (text && text.length <= MAX_PROMOTED_TITLE_CHARS) {
          lines.push(`${'#'.repeat(PROMOTED_TITLE_LEVEL)} ${text}`);
        } else if (text) {
          lines.push(text);
        }
        return;
      }

      const isBlock = BLOCK_TAGS.has(tag);
      if (isBlock) flush();
      for (const child of el.children ?? []) walk(child, listDepth);
      if (isBlock) flush();
    };

    walk(root.get(0) as AnyNode, 0);
    flush();

    return { title, content: tidy(lines) };
  }

  /**
   * Same-site links under `prefix` (e.g. `/promotions`), as normalized paths
   * without query/hash, deduplicated, in document order. The prefix itself is
   * excluded.
   */
  extractLinks(html: string, prefix: string, baseUrl: string): string[] {
    const $ = cheerio.load(html);
    const base = new URL(baseUrl);
    const seen = new Set<string>();
    const out: string[] = [];

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      let url: URL;
      try {
        url = new URL(href, base);
      } catch {
        return;
      }
      if (url.host !== base.host) return;
      const path = url.pathname.replace(/\/+$/, '');
      if (!path.startsWith(`${prefix}/`) || path === prefix) return;
      if (seen.has(path)) return;
      seen.add(path);
      out.push(path);
    });

    return out;
  }
}

function hasBlockChildren(el: Element): boolean {
  return (el.children ?? []).some(
    (child) =>
      child.type === 'tag' &&
      (BLOCK_TAGS.has((child as Element).name.toLowerCase()) ||
        HEADING_RE.test((child as Element).name.toLowerCase()) ||
        (child as Element).name.toLowerCase() === 'li'),
  );
}

function isPromotedTitle(el: Element): boolean {
  const cls = el.attribs?.class ?? '';
  return cls
    .split(/\s+/)
    .some((token) => token === 'title' || (/(^|-)title$/.test(token) && token !== 'page-title'));
}

function normalizeInline(text: string): string {
  return text.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanTitle(raw: string): string {
  const normalized = normalizeInline(raw);
  const cut = normalized.split(' | ')[0]?.trim();
  return cut || normalized;
}

function tidy(lines: string[]): string {
  const out: string[] = [];
  let previous: string | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^[-#\s]*$/.test(line)) continue; // empty bullet or bare hashes
    if (line === previous) continue;
    out.push(line);
    previous = line;
  }

  return out.join('\n');
}
