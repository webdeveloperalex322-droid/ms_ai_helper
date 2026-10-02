/**
 * Argument parsing for `pnpm site:crawl` and `pnpm site:import`.
 *
 * Side-effect free (no env, no console, no process.exit) so it stays
 * unit-testable; scripts/ wires it to the real world (ADR-009).
 */
import { DEFAULT_INFO_PAGES } from './snapshot';
import { DEFAULT_CRAWL_CONCURRENCY, DEFAULT_PAGE_TIMEOUT_MS } from './crawler/site-crawler.service';

export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_NO_BROWSER = 2;
export const EXIT_PARTIAL = 3;

export const MAX_CRAWL_CONCURRENCY = 6;

export interface CrawlCliOptions {
  siteUrl: string;
  rn: string;
  br: string;
  out: string;
  pages: string[];
  promotionDetails: boolean;
  browser?: string;
  pageTimeoutMs: number;
  concurrency: number;
}

export interface ImportCliOptions {
  snapshotPath: string;
  force: boolean;
  dryRun: boolean;
}

export type CliParseResult<T> =
  | { kind: 'options'; options: T }
  | { kind: 'help' }
  | { kind: 'error'; message: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Token {
  flag: string;
  inline?: string;
}

function splitFlag(token: string): Token {
  const eq = token.indexOf('=');
  return eq === -1 ? { flag: token } : { flag: token.slice(0, eq), inline: token.slice(eq + 1) };
}

function normalizePath(path: string): string {
  const trimmed = path.trim().replace(/^\/+/, '').replace(/\/+$/, '');
  return trimmed === '' ? '/' : `/${trimmed}`;
}

export function parseCrawlArgs(argv: string[]): CliParseResult<CrawlCliOptions> {
  if (argv.some((arg) => arg === '--help' || arg === '-h')) {
    return { kind: 'help' };
  }

  const values: Record<string, string> = {};
  let promotionDetails = true;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      return { kind: 'error', message: `Unexpected argument: ${token}` };
    }
    const { flag, inline } = splitFlag(token);

    if (flag === '--no-promotion-details') {
      if (inline !== undefined) return { kind: 'error', message: `${flag} does not take a value` };
      promotionDetails = false;
      continue;
    }

    if (
      ![
        '--url',
        '--rn',
        '--br',
        '--out',
        '--pages',
        '--browser',
        '--page-timeout',
        '--concurrency',
      ].includes(flag)
    ) {
      return { kind: 'error', message: `Unknown flag: ${flag}` };
    }

    const value = inline ?? argv[++i];
    if (value === undefined || value.startsWith('--')) {
      return { kind: 'error', message: `${flag} requires a value` };
    }
    values[flag] = value;
  }

  for (const required of ['--url', '--rn', '--br', '--out']) {
    if (!values[required]) return { kind: 'error', message: `${required} is required` };
  }

  let siteUrl: string;
  try {
    const url = new URL(values['--url']);
    if (!/^https?:$/.test(url.protocol)) throw new Error('not http(s)');
    siteUrl = url.origin + url.pathname.replace(/\/+$/, '');
  } catch {
    return {
      kind: 'error',
      message: `--url must be an absolute http(s) url, got: ${values['--url']}`,
    };
  }

  for (const flag of ['--rn', '--br']) {
    if (!UUID_RE.test(values[flag])) {
      return { kind: 'error', message: `${flag} must be a uuid, got: ${values[flag]}` };
    }
  }

  const pages = values['--pages']
    ? values['--pages']
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
        .map(normalizePath)
    : [...DEFAULT_INFO_PAGES];
  if (pages.length === 0) return { kind: 'error', message: '--pages must list at least one path' };

  const pageTimeoutMs = parseNumber(
    values['--page-timeout'],
    DEFAULT_PAGE_TIMEOUT_MS,
    1_000,
    3_600_000,
  );
  if (pageTimeoutMs === null) {
    return {
      kind: 'error',
      message: `--page-timeout must be a number of milliseconds between 1000 and 3600000`,
    };
  }
  const concurrency = parseNumber(
    values['--concurrency'],
    DEFAULT_CRAWL_CONCURRENCY,
    1,
    MAX_CRAWL_CONCURRENCY,
  );
  if (concurrency === null) {
    return {
      kind: 'error',
      message: `--concurrency must be an integer between 1 and ${MAX_CRAWL_CONCURRENCY}`,
    };
  }

  return {
    kind: 'options',
    options: {
      siteUrl,
      rn: values['--rn'],
      br: values['--br'],
      out: values['--out'],
      pages,
      promotionDetails,
      browser: values['--browser'],
      pageTimeoutMs,
      concurrency,
    },
  };
}

function parseNumber(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number | null {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) return null;
  return value;
}

export function parseImportArgs(argv: string[]): CliParseResult<ImportCliOptions> {
  if (argv.some((arg) => arg === '--help' || arg === '-h')) {
    return { kind: 'help' };
  }

  let snapshotPath: string | undefined;
  let force = false;
  let dryRun = false;

  for (const token of argv) {
    if (token === '--force') {
      force = true;
    } else if (token === '--dry-run') {
      dryRun = true;
    } else if (token.startsWith('--')) {
      return { kind: 'error', message: `Unknown flag: ${token}` };
    } else if (snapshotPath === undefined) {
      snapshotPath = token;
    } else {
      return { kind: 'error', message: `Unexpected argument: ${token}` };
    }
  }

  if (!snapshotPath) {
    return { kind: 'error', message: 'snapshot path is required' };
  }

  return { kind: 'options', options: { snapshotPath, force, dryRun } };
}

export function formatCrawlHelp(): string {
  return [
    'Usage: pnpm site:crawl --url <site-url> --rn <uuid> --br <uuid> --out <file.json> [options]',
    '',
    'Renders the informational pages of a city site in a headless browser and writes a snapshot.',
    '',
    'Options:',
    '  --url <url>               base url of the city site, e.g. https://tyumen.sushi-master.ru',
    '  --rn <uuid>               retail network id',
    '  --br <uuid>               branch (city) id',
    '  --out <file>              snapshot file to write (overwritten)',
    `  --pages <a,b,...>         paths to visit (default: ${DEFAULT_INFO_PAGES.join(',')})`,
    '  --no-promotion-details    do not follow /promotions/<slug> links',
    '  --browser <path>          Chromium-based browser executable (default: BROWSER_EXECUTABLE_PATH or auto-detect)',
    `  --page-timeout <ms>       per-page timeout (default: ${DEFAULT_PAGE_TIMEOUT_MS})`,
    `  --concurrency <n>         parallel tabs, 1..${MAX_CRAWL_CONCURRENCY} (default: ${DEFAULT_CRAWL_CONCURRENCY})`,
    '  --help                    show this help',
    '',
    `Exit codes: ${EXIT_OK} ok, ${EXIT_PARTIAL} some pages failed (snapshot written), ${EXIT_NO_BROWSER} browser not found, ${EXIT_ERROR} error`,
  ].join('\n');
}

export function formatImportHelp(): string {
  return [
    'Usage: pnpm site:import <snapshot.json> [--force] [--dry-run]',
    '',
    'Loads a crawl snapshot into the database: upserts pages, chunks them and builds embeddings.',
    'Honors EMBEDDING_PROVIDER / EMBEDDING_MODEL from .env.',
    '',
    'Options:',
    '  --force     re-index every page even if its content and embeddings are up to date',
    '  --dry-run   report what would change without writing or calling the embedding provider',
    '  --help      show this help',
    '',
    `Exit codes: ${EXIT_OK} ok, ${EXIT_PARTIAL} some pages or chunks failed, ${EXIT_ERROR} invalid snapshot / error`,
  ].join('\n');
}
