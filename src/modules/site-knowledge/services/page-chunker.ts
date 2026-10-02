/**
 * Splits the markdown-like text of a site page into retrieval-sized chunks.
 *
 * Sections are cut at headings of levels 1–3; a section longer than
 * `maxChars` is split by paragraphs (and, failing that, hard-split); tails
 * shorter than `minTail` are glued to the previous chunk. Every chunk text
 * starts with `<page title> › <heading path>` so the embedding keeps its
 * context even when the body is a bare list of hours or prices.
 */
export interface PageChunkDraft {
  index: number;
  heading: string | null;
  text: string;
}

export interface ChunkPageOptions {
  maxChars?: number;
  minTail?: number;
}

export const DEFAULT_MAX_CHARS = 1200;
export const DEFAULT_MIN_TAIL = 80;
const MAX_HEADING_LEVEL = 3;
const HEADING_SEPARATOR = ' › ';

interface Section {
  path: string[];
  body: string;
}

const HEADING_RE = /^(#{1,6})\s+(.*\S)\s*$/;

export function chunkPage(
  page: { title: string; content: string },
  options: ChunkPageOptions = {},
): PageChunkDraft[] {
  const content = page.content ?? '';
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const minTail = options.minTail ?? DEFAULT_MIN_TAIL;
  const title = page.title.trim();

  const sections = splitIntoSections(content, title);
  const pieces: { path: string[]; body: string }[] = [];

  for (const section of sections) {
    for (const body of splitBody(section.body, maxChars)) {
      pieces.push({ path: section.path, body });
    }
  }

  const merged = mergeTails(pieces, minTail, maxChars);

  return merged.map((piece, index) => {
    const heading = piece.path.length ? piece.path.join(HEADING_SEPARATOR) : null;
    const prefix = heading ? `${title}${HEADING_SEPARATOR}${heading}` : title;
    return { index, heading, text: `${prefix}\n${piece.body}` };
  });
}

function splitIntoSections(content: string, title: string): Section[] {
  const sections: Section[] = [];
  const stack: string[] = []; // heading text per level (index = level - 1)
  let bodyLines: string[] = [];

  const flush = () => {
    const body = bodyLines.join('\n').trim();
    if (body) {
      sections.push({ path: stack.filter(Boolean), body });
    }
    bodyLines = [];
  };

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const match = HEADING_RE.exec(line);

    if (!match) {
      bodyLines.push(line);
      continue;
    }

    const level = match[1].length;
    const text = match[2].trim();

    if (level > MAX_HEADING_LEVEL) {
      bodyLines.push(text);
      continue;
    }

    flush();
    stack.length = level - 1;
    // The page's own h1 is already the chunk prefix; do not repeat it.
    stack[level - 1] = level === 1 && sameTitle(text, title) ? '' : text;
  }

  flush();
  return sections;
}

function sameTitle(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function splitBody(body: string, maxChars: number): string[] {
  if (body.length <= maxChars) {
    return [body];
  }

  const paragraphs = body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const units = paragraphs.length > 1 ? paragraphs : body.split('\n').filter((l) => l.trim());

  const out: string[] = [];
  let current = '';

  const push = () => {
    if (current.trim()) out.push(current.trim());
    current = '';
  };

  for (const unit of units) {
    if (unit.length > maxChars) {
      push();
      out.push(...hardSplit(unit, maxChars));
      continue;
    }
    const candidate = current ? `${current}\n${unit}` : unit;
    if (candidate.length > maxChars) {
      push();
      current = unit;
    } else {
      current = candidate;
    }
  }
  push();

  return out.length ? out : [body];
}

/** Cuts at sentence or word boundaries where possible, never above maxChars. */
function hardSplit(text: string, maxChars: number): string[] {
  const out: string[] = [];
  let rest = text.trim();

  while (rest.length > maxChars) {
    const window = rest.slice(0, maxChars);
    let cut = Math.max(
      window.lastIndexOf('. '),
      window.lastIndexOf('; '),
      window.lastIndexOf('! '),
    );
    if (cut < maxChars * 0.5) cut = window.lastIndexOf(' ');
    if (cut <= 0) cut = maxChars;
    out.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) out.push(rest);

  return out;
}

function mergeTails(
  pieces: { path: string[]; body: string }[],
  minTail: number,
  maxChars: number,
): { path: string[]; body: string }[] {
  const out: { path: string[]; body: string }[] = [];

  for (const piece of pieces) {
    const previous = out[out.length - 1];
    if (previous && piece.body.length < minTail) {
      const label = piece.path.length ? piece.path[piece.path.length - 1] : '';
      const glued = label ? `${label}\n${piece.body}` : piece.body;
      if (previous.body.length + glued.length + 1 <= maxChars * 1.25) {
        previous.body = `${previous.body}\n${glued}`;
        continue;
      }
    }
    out.push({ path: [...piece.path], body: piece.body });
  }

  return out;
}
