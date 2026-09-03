/**
 * Argument parsing for the bulk RAG indexer (`pnpm rag:index-all`).
 *
 * Kept free of side effects on purpose: no env reads, no console output, no
 * process.exit. The CLI wrapper in scripts/rag-index-all.ts does all of that,
 * which keeps this logic unit-testable (scripts/ is outside vitest include).
 */

export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_EMPTY = 2;
export const EXIT_PARTIAL_FAILURE = 3;

export const MAX_CONCURRENCY = 10;

export const DEFAULT_BATCH_SIZE = 32;
export const DEFAULT_CONCURRENCY = 3;
export const DEFAULT_PAGE_SIZE = 500;
export const DEFAULT_RETRIES = 3;

export interface ParsedBulkIndexOptions {
  rn?: string;
  br?: string;
  target?: string;
  force: boolean;
  dryRun: boolean;
  batchSize: number;
  concurrency: number;
  pageSize: number;
  retries: number;
  limit?: number;
}

export type ParseResult =
  | { kind: 'options'; options: ParsedBulkIndexOptions; warnings: string[] }
  | { kind: 'help' }
  | { kind: 'error'; message: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface NumericSpec {
  min: number;
  max: number;
  clamp?: boolean;
}

const NUMERIC_FLAGS: Record<string, NumericSpec> = {
  '--batch-size': { min: 1, max: 128 },
  '--concurrency': { min: 1, max: MAX_CONCURRENCY, clamp: true },
  '--page-size': { min: 50, max: 5000 },
  '--retries': { min: 1, max: 10 },
  '--limit': { min: 1, max: Number.MAX_SAFE_INTEGER },
};

const UUID_FLAGS = ['--rn', '--br'];
const STRING_FLAGS = ['--target'];
const BOOLEAN_FLAGS = ['--force', '--dry-run'];

export function parseBulkIndexArgs(argv: string[]): ParseResult {
  if (argv.some((arg) => arg === '--help' || arg === '-h')) {
    return { kind: 'help' };
  }

  const warnings: string[] = [];
  const numeric: Record<string, number> = {};
  const strings: Record<string, string> = {};
  let force = false;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];

    if (!token.startsWith('--')) {
      return { kind: 'error', message: `Unexpected argument: ${token}` };
    }

    const eq = token.indexOf('=');
    const flag = eq === -1 ? token : token.slice(0, eq);
    const inlineValue = eq === -1 ? undefined : token.slice(eq + 1);

    if (BOOLEAN_FLAGS.includes(flag)) {
      if (inlineValue !== undefined) {
        return { kind: 'error', message: `${flag} does not take a value` };
      }
      if (flag === '--force') force = true;
      if (flag === '--dry-run') dryRun = true;
      continue;
    }

    const isKnown =
      UUID_FLAGS.includes(flag) || STRING_FLAGS.includes(flag) || flag in NUMERIC_FLAGS;

    if (!isKnown) {
      return { kind: 'error', message: `Unknown flag: ${flag}` };
    }

    let value = inlineValue;
    if (value === undefined) {
      value = argv[++i];
    }
    if (value === undefined) {
      return { kind: 'error', message: `${flag} requires a value` };
    }

    if (UUID_FLAGS.includes(flag)) {
      if (!UUID_RE.test(value)) {
        return { kind: 'error', message: `${flag} must be a uuid, got: ${value}` };
      }
      strings[flag] = value;
      continue;
    }

    if (STRING_FLAGS.includes(flag)) {
      if (value.trim() === '') {
        return { kind: 'error', message: `${flag} must not be empty` };
      }
      strings[flag] = value;
      continue;
    }

    const spec = NUMERIC_FLAGS[flag];
    const parsed = Number(value);

    if (!Number.isInteger(parsed)) {
      return { kind: 'error', message: `${flag} must be an integer, got: ${value}` };
    }
    if (parsed < spec.min) {
      return { kind: 'error', message: `${flag} must be >= ${spec.min}, got: ${parsed}` };
    }
    if (parsed > spec.max) {
      if (!spec.clamp) {
        return { kind: 'error', message: `${flag} must be <= ${spec.max}, got: ${parsed}` };
      }
      warnings.push(`${flag}=${parsed} exceeds the safe maximum, capped at ${spec.max}`);
      numeric[flag] = spec.max;
      continue;
    }

    numeric[flag] = parsed;
  }

  return {
    kind: 'options',
    warnings,
    options: {
      rn: strings['--rn'],
      br: strings['--br'],
      target: strings['--target'],
      force,
      dryRun,
      batchSize: numeric['--batch-size'] ?? DEFAULT_BATCH_SIZE,
      concurrency: numeric['--concurrency'] ?? DEFAULT_CONCURRENCY,
      pageSize: numeric['--page-size'] ?? DEFAULT_PAGE_SIZE,
      retries: numeric['--retries'] ?? DEFAULT_RETRIES,
      limit: numeric['--limit'],
    },
  };
}

export function formatHelp(): string {
  return [
    'Usage: pnpm rag:index-all [options]',
    '',
    'Builds searchable-text chunks and embeddings for every city_products row.',
    '',
    'Options:',
    '  --rn <uuid>          only index this retail network',
    '  --br <uuid>          only index this branch/city',
    '  --target <str>       only index this target (WEB, APP, ...)',
    '  --force              reindex everything, ignoring the up-to-date check',
    '  --dry-run            report how much work there is, change nothing',
    `  --batch-size <n>     embeddings requested per provider call (1..128, default ${DEFAULT_BATCH_SIZE})`,
    `  --concurrency <n>    batches in flight (1..${MAX_CONCURRENCY}, default ${DEFAULT_CONCURRENCY})`,
    `  --page-size <n>      rows fetched per database page (50..5000, default ${DEFAULT_PAGE_SIZE})`,
    `  --retries <n>        attempts per batch (1..10, default ${DEFAULT_RETRIES})`,
    '  --limit <n>          stop after N candidates (for trial runs)',
    '  --help, -h           show this help',
    '',
    'Environment: DATABASE_URL (required), EMBEDDING_PROVIDER (mock|openai),',
    'EMBEDDING_MODEL, OPENAI_API_KEY, OPENAI_BASE_URL — read from .env',
    '(.env.test when NODE_ENV=test).',
    '',
    'Exit codes:',
    `  ${EXIT_OK}  success, nothing failed`,
    `  ${EXIT_ERROR}  fatal error (bad argument, no database, unexpected failure)`,
    `  ${EXIT_EMPTY}  the filters matched no catalog rows`,
    `  ${EXIT_PARTIAL_FAILURE}  run finished but some items failed`,
  ].join('\n');
}
