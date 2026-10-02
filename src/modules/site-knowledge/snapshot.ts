import { createHash } from 'crypto';
import { readFile } from 'fs/promises';

/**
 * A crawl snapshot is the hand-off between the browser-driven crawler (which
 * runs on a workstation) and the importer (which runs wherever the database
 * is). It is a plain JSON file kept under data/site-pages/ so the collected
 * text can be reviewed and shipped with the code.
 */
export const SNAPSHOT_VERSION = 1;

/** Informational routes every city site of the network exposes. */
export const DEFAULT_INFO_PAGES: readonly string[] = [
  '/about',
  '/delivery',
  '/bonus',
  '/promotions',
  '/our-restourants',
  '/llm-info',
  '/public-oferta',
  '/privacy',
  '/personal-data-processing',
  '/personal-data-transfer',
];

/** A rendered page with less text than this is a bare shell, not content. */
export const MIN_CONTENT_CHARS = 200;

export type SnapshotPageStatus = 'ok' | 'failed';

export interface CrawlSnapshotPage {
  key: string;
  path: string;
  url: string;
  title: string;
  status: SnapshotPageStatus;
  error: string | null;
  fetched_at: string;
  content_hash: string;
  content: string;
}

export interface CrawlSnapshot {
  version: number;
  site_url: string;
  city_slug?: string;
  rn: string;
  br: string;
  crawled_at: string;
  pages: CrawlSnapshotPage[];
}

export class SnapshotValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotValidationError';
  }
}

export function pageKeyFromPath(path: string): string {
  const withoutQuery = path.split(/[?#]/)[0] ?? '';
  const trimmed = withoutQuery.replace(/^\/+/, '').replace(/\/+$/, '');
  return trimmed === '' ? 'home' : trimmed;
}

export function contentHash(text: string): string {
  return createHash('md5').update(text).digest('hex');
}

function requireString(obj: Record<string, unknown>, field: string, where: string): string {
  const value = obj[field];
  if (typeof value !== 'string' || value === '') {
    throw new SnapshotValidationError(`${where}: field "${field}" must be a non-empty string`);
  }
  return value;
}

function validatePage(input: unknown, index: number): CrawlSnapshotPage {
  const where = `pages[${index}]`;
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new SnapshotValidationError(`${where}: must be an object`);
  }
  const page = input as Record<string, unknown>;

  const status = page.status;
  if (status !== 'ok' && status !== 'failed') {
    throw new SnapshotValidationError(`${where}: status must be "ok" or "failed"`);
  }

  const content = typeof page.content === 'string' ? page.content : '';
  if (status === 'ok' && content.trim() === '') {
    throw new SnapshotValidationError(`${where}: an "ok" page must carry non-empty content`);
  }

  return {
    key: requireString(page, 'key', where),
    path: requireString(page, 'path', where),
    url: requireString(page, 'url', where),
    title: typeof page.title === 'string' ? page.title : '',
    status,
    error: typeof page.error === 'string' ? page.error : null,
    fetched_at: requireString(page, 'fetched_at', where),
    content_hash: typeof page.content_hash === 'string' ? page.content_hash : contentHash(content),
    content,
  };
}

export function validateSnapshot(input: unknown): CrawlSnapshot {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new SnapshotValidationError('snapshot must be a JSON object');
  }
  const obj = input as Record<string, unknown>;

  if (obj.version !== SNAPSHOT_VERSION) {
    throw new SnapshotValidationError(
      `snapshot: unsupported version ${String(obj.version)} (expected ${SNAPSHOT_VERSION})`,
    );
  }

  const site_url = requireString(obj, 'site_url', 'snapshot');
  const rn = requireString(obj, 'rn', 'snapshot');
  const br = requireString(obj, 'br', 'snapshot');
  const crawled_at = requireString(obj, 'crawled_at', 'snapshot');

  if (!Array.isArray(obj.pages)) {
    throw new SnapshotValidationError('snapshot: field "pages" must be an array');
  }

  const pages = obj.pages.map((page, index) => validatePage(page, index));

  const seen = new Set<string>();
  for (const page of pages) {
    if (seen.has(page.url)) {
      throw new SnapshotValidationError(`snapshot: duplicate page url "${page.url}"`);
    }
    seen.add(page.url);
  }

  return {
    version: SNAPSHOT_VERSION,
    site_url,
    city_slug: typeof obj.city_slug === 'string' ? obj.city_slug : undefined,
    rn,
    br,
    crawled_at,
    pages,
  };
}

export async function readSnapshot(filePath: string): Promise<CrawlSnapshot> {
  const raw = await readFile(filePath, 'utf-8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new SnapshotValidationError(
      `${filePath}: not valid JSON (${err instanceof Error ? err.message : String(err)})`,
    );
  }
  return validateSnapshot(parsed);
}
