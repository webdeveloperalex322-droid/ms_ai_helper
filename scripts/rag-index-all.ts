/**
 * Bulk RAG indexer: builds a searchable-text chunk + embedding for EVERY
 * city_products row (optionally narrowed to an rn / br / target slice).
 *
 * Usage:
 *   pnpm rag:index-all
 *   pnpm rag:index-all --br <uuid> --force
 *   pnpm rag:index-all --dry-run
 *   pnpm rag:index-all --help
 *
 * Honors EMBEDDING_PROVIDER (mock|openai) from .env. Mock works fully offline.
 *
 * Note: standalone script (no Nest DI) — tsx/esbuild doesn't emit decorator
 * metadata, so services are instantiated manually, like seeds/ and
 * rag-index-product.ts. All the logic lives in src/modules/rag so it stays
 * under test; this file only parses argv, wires services and prints.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import type { ConfigService } from '@nestjs/config';
import * as schema from '../src/database/schema';
import { SearchableTextBuilderService } from '../src/modules/rag/services/searchable-text-builder.service';
import { EmbeddingService } from '../src/modules/rag/services/embedding.service';
import { RagBulkIndexerService } from '../src/modules/rag/services/bulk-indexer.service';
import type {
  BulkIndexProgress,
  BulkIndexReport,
} from '../src/modules/rag/services/bulk-indexer.service';
import { MockEmbeddingProvider } from '../src/modules/rag/providers/mock-embedding.provider';
import { OpenAIEmbeddingProvider } from '../src/modules/rag/providers/openai-embedding.provider';
import { AitunnelOpenAIClientService } from '../src/common/llm/aitunnel-openai-client.service';
import type { EmbeddingProvider } from '../src/modules/rag/providers/embedding.provider.interface';
import {
  parseBulkIndexArgs,
  formatHelp,
  EXIT_OK,
  EXIT_ERROR,
  EXIT_EMPTY,
  EXIT_PARTIAL_FAILURE,
  type ParsedBulkIndexOptions,
} from '../src/modules/rag/bulk-index-options';

const MAX_LISTED_FAILURES = 50;
const PROGRESS_INTERVAL_MS = 2000;

// Minimal ConfigService shim backed by process.env (no Nest container).
const configShim = { get: (k: string) => process.env[k] } as unknown as ConfigService;

function buildProvider(): EmbeddingProvider {
  if ((process.env.EMBEDDING_PROVIDER ?? 'mock') === 'openai') {
    const client = new AitunnelOpenAIClientService(configShim);
    client.onModuleInit();
    return new OpenAIEmbeddingProvider(client, configShim);
  }
  return new MockEmbeddingProvider();
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function printHeader(options: ParsedBulkIndexOptions, provider: EmbeddingProvider): void {
  const mode = options.dryRun ? 'dry-run' : options.force ? 'force' : 'incremental';

  console.log('RAG bulk index');
  console.log(`  provider:    ${provider.modelName()}`);
  console.log(
    `  filters:     rn=${options.rn ?? 'any'} br=${options.br ?? 'any'} target=${options.target ?? 'any'}`,
  );
  console.log(
    `  batch size:  ${options.batchSize}   concurrency: ${options.concurrency}   ` +
      `page size: ${options.pageSize}   retries: ${options.retries}`,
  );
  console.log(`  mode:        ${mode}${options.limit ? `   limit: ${options.limit}` : ''}`);
  console.log('');
}

function createProgressPrinter(startedAt: number) {
  const isTty = Boolean(process.stdout.isTTY);
  let lastPrintedAt = 0;

  return (progress: BulkIndexProgress) => {
    const now = Date.now();
    const done = progress.processed + progress.skipped + progress.failed;
    const finished = done >= progress.total;

    if (!finished && now - lastPrintedAt < PROGRESS_INTERVAL_MS) {
      return;
    }
    lastPrintedAt = now;

    const elapsedSec = Math.max(0.001, (now - startedAt) / 1000);
    const rate = done / elapsedSec;
    const remaining = Math.max(0, progress.total - done);
    const eta = rate > 0 ? formatDuration((remaining / rate) * 1000) : '--:--';

    const line =
      `  ${done}/${progress.total}  ok=${progress.processed} skip=${progress.skipped} ` +
      `fail=${progress.failed}  ${rate.toFixed(1)} it/s  ETA ${eta}`;

    if (isTty) {
      process.stdout.write(`\r${line.padEnd(80)}`);
    } else {
      console.log(line);
    }
  };
}

function printReport(report: BulkIndexReport, isTty: boolean): void {
  if (isTty) {
    process.stdout.write('\r'.padEnd(82) + '\r');
  }

  if (report.dryRun) {
    console.log('Dry run — nothing was written');
    console.log(`  would process: ${report.processed}`);
    console.log(`  would skip:    ${report.skipped}`);
    console.log(`  total:         ${report.total}`);
    return;
  }

  console.log(`${report.aborted ? 'Interrupted' : 'Done'} in ${formatDuration(report.durationMs)}`);
  console.log(`  total:     ${report.total}`);
  console.log(`  processed: ${report.processed}`);
  console.log(`  skipped:   ${report.skipped}`);
  console.log(`  failed:    ${report.failed}`);

  if (report.failures.length > 0) {
    const listed = report.failures.slice(0, MAX_LISTED_FAILURES);
    console.log(
      `Failed items (showing ${listed.length} of ${report.failures.length}):`,
    );
    for (const failure of listed) {
      console.log(
        `  product=${failure.productId} br=${failure.br} target=${failure.target} — ${failure.reason}`,
      );
    }
  }
}

async function main(): Promise<number> {
  const parsed = parseBulkIndexArgs(process.argv.slice(2));

  if (parsed.kind === 'help') {
    console.log(formatHelp());
    return EXIT_OK;
  }

  if (parsed.kind === 'error') {
    console.error(parsed.message);
    console.error('');
    console.error(formatHelp());
    return EXIT_ERROR;
  }

  for (const warning of parsed.warnings) {
    console.error(`warning: ${warning}`);
  }

  const options = parsed.options;
  const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
  dotenv.config({ path: resolve(process.cwd(), envFile) });

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set');
    return EXIT_ERROR;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema }) as any;
  const provider = buildProvider();
  const textBuilder = new SearchableTextBuilderService(db);
  const embeddings = new EmbeddingService(db, provider);
  const indexer = new RagBulkIndexerService(db, textBuilder, embeddings, provider);

  const controller = new AbortController();
  const onSigint = () => {
    console.error('\nInterrupted — finishing the batches already in flight...');
    controller.abort();
  };
  process.on('SIGINT', onSigint);

  try {
    printHeader(options, provider);

    const startedAt = Date.now();
    const report = await indexer.run({
      ...options,
      onProgress: createProgressPrinter(startedAt),
      signal: controller.signal,
    });

    if (report.total === 0) {
      console.error(
        'No catalog rows matched the filters ' +
          `(rn=${options.rn ?? 'any'} br=${options.br ?? 'any'} target=${options.target ?? 'any'}). ` +
          'Check the identifiers or import the catalog first.',
      );
      return EXIT_EMPTY;
    }

    printReport(report, Boolean(process.stdout.isTTY));

    return report.failed > 0 ? EXIT_PARTIAL_FAILURE : EXIT_OK;
  } finally {
    process.off('SIGINT', onSigint);
    await pool.end();
  }
}

main()
  .then((code) => {
    process.exit(code);
  })
  .catch((err) => {
    console.error('rag:index-all failed:', err instanceof Error ? err.message : err);
    process.exit(EXIT_ERROR);
  });
