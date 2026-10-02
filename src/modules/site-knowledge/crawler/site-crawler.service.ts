import type { PageFetcher } from './page-fetcher.interface';
import { HtmlTextExtractor } from './html-text-extractor';
import {
  DEFAULT_INFO_PAGES,
  MIN_CONTENT_CHARS,
  SNAPSHOT_VERSION,
  contentHash,
  pageKeyFromPath,
  type CrawlSnapshot,
  type CrawlSnapshotPage,
} from '../snapshot';

export const PROMOTIONS_PATH = '/promotions';
export const DEFAULT_PAGE_TIMEOUT_MS = 180_000;
export const DEFAULT_CRAWL_CONCURRENCY = 2;
export const DEFAULT_MAX_PROMOTION_DETAILS = 30;

export interface CrawlOptions {
  siteUrl: string;
  rn: string;
  br: string;
  citySlug?: string;
  /** Paths to visit; defaults to DEFAULT_INFO_PAGES. */
  pages?: string[];
  /** Follow `/promotions/<slug>` links found on the promotions list (depth 1). */
  promotionDetails?: boolean;
  maxPromotionDetails?: number;
  pageTimeoutMs?: number;
  concurrency?: number;
  onPage?: (page: CrawlSnapshotPage) => void;
}

/**
 * Visits the informational pages of one city site and assembles a snapshot.
 * Pure orchestration: fetching is delegated to a PageFetcher, text extraction
 * to HtmlTextExtractor, so the traversal is testable without a browser.
 */
export class SiteCrawlerService {
  constructor(
    private readonly fetcher: PageFetcher,
    private readonly extractor: HtmlTextExtractor,
  ) {}

  async crawl(options: CrawlOptions): Promise<CrawlSnapshot> {
    const siteUrl = options.siteUrl.replace(/\/+$/, '');
    const timeoutMs = options.pageTimeoutMs ?? DEFAULT_PAGE_TIMEOUT_MS;
    const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CRAWL_CONCURRENCY);
    const followPromotions = options.promotionDetails ?? true;
    const maxPromotionDetails = options.maxPromotionDetails ?? DEFAULT_MAX_PROMOTION_DETAILS;

    const queue: string[] = [];
    const seen = new Set<string>();
    const enqueue = (path: string): boolean => {
      const normalized = normalizePath(path);
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      queue.push(normalized);
      return true;
    };
    for (const path of options.pages ?? DEFAULT_INFO_PAGES) enqueue(path);

    const results = new Map<string, CrawlSnapshotPage>();
    let promotionDetailsAdded = 0;

    const worker = async () => {
      for (;;) {
        const path = queue.shift();
        if (path === undefined) return;

        const page = await this.crawlOne(siteUrl, path, timeoutMs);
        results.set(path, page);
        options.onPage?.(page);

        if (followPromotions && path === PROMOTIONS_PATH && page.status === 'ok' && page.rawHtml) {
          for (const link of this.extractor.extractLinks(page.rawHtml, PROMOTIONS_PATH, siteUrl)) {
            if (promotionDetailsAdded >= maxPromotionDetails) break;
            if (enqueue(link)) promotionDetailsAdded++;
          }
        }
        delete page.rawHtml;
      }
    };

    try {
      await Promise.all(Array.from({ length: concurrency }, () => worker()));
    } finally {
      await this.fetcher.close();
    }

    // Insertion order of `seen` = requested order, then discovered links.
    const pages = [...seen].map((path) => results.get(path)!).filter(Boolean);

    return {
      version: SNAPSHOT_VERSION,
      site_url: siteUrl,
      city_slug: options.citySlug,
      rn: options.rn,
      br: options.br,
      crawled_at: new Date().toISOString(),
      pages,
    };
  }

  private async crawlOne(
    siteUrl: string,
    path: string,
    timeoutMs: number,
  ): Promise<CrawlSnapshotPage & { rawHtml?: string }> {
    const url = `${siteUrl}${path === '/' ? '/' : path}`;
    const base: CrawlSnapshotPage = {
      key: pageKeyFromPath(path),
      path,
      url,
      title: '',
      status: 'failed',
      error: null,
      fetched_at: new Date().toISOString(),
      content_hash: '',
      content: '',
    };

    let fetched;
    try {
      fetched = await this.fetcher.fetch(url, { timeoutMs });
    } catch (err) {
      return { ...base, error: describe(err) };
    }

    const extracted = this.extractor.extract(fetched.html);
    const title = extracted.title || fetched.title || path;

    if (extracted.content.length < MIN_CONTENT_CHARS) {
      return {
        ...base,
        title,
        content: extracted.content,
        error: `empty content (${extracted.content.length} chars)`,
      };
    }

    return {
      ...base,
      title,
      status: 'ok',
      content: extracted.content,
      content_hash: contentHash(extracted.content),
      rawHtml: fetched.html,
    };
  }
}

function normalizePath(path: string): string {
  const withoutQuery = path.split(/[?#]/)[0] ?? '';
  const trimmed = withoutQuery.replace(/^\/+/, '').replace(/\/+$/, '');
  return trimmed === '' ? '/' : `/${trimmed}`;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
