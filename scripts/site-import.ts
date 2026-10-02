/**
 * Site knowledge import: loads a crawl snapshot (see `pnpm site:crawl`) into
 * site_pages / site_page_chunks and builds embeddings.
 *
 * Usage:
 *   pnpm site:import data/site-pages/tyumen.json
 *   pnpm site:import data/site-pages/tyumen.json --force
 *   pnpm site:import data/site-pages/tyumen.json --dry-run
 *
 * Honors EMBEDDING_PROVIDER (mock|openai) and EMBEDDING_MODEL from .env.
 * No browser needed — runs anywhere the database is reachable, including the
 * one-off node container used for `rag:index-all` on the server.
 *
 * Standalone script (no Nest DI): tsx does not emit decorator metadata, so the
 * services are wired by hand like in scripts/rag-index-all.ts.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import type { ConfigService } from '@nestjs/config';
import * as schema from '../src/database/schema';
import { MockEmbeddingProvider } from '../src/modules/rag/providers/mock-embedding.provider';
import { OpenAIEmbeddingProvider } from '../src/modules/rag/providers/openai-embedding.provider';
import { AitunnelOpenAIClientService } from '../src/common/llm/aitunnel-openai-client.service';
import type { EmbeddingProvider } from '../src/modules/rag/providers/embedding.provider.interface';
import {
  EXIT_ERROR,
  EXIT_OK,
  EXIT_PARTIAL,
  formatImportHelp,
  parseImportArgs,
} from '../src/modules/site-knowledge/cli-options';
import { readSnapshot, SnapshotValidationError } from '../src/modules/site-knowledge/snapshot';
import { SitePageIndexerService } from '../src/modules/site-knowledge/services/site-page-indexer.service';
import {
  SitePageImportService,
  type ImportReport,
} from '../src/modules/site-knowledge/services/site-page-import.service';

const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
dotenv.config({ path: resolve(process.cwd(), envFile) });

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

function printReport(report: ImportReport): void {
  for (const page of report.pages) {
    const path = new URL(page.url).pathname.padEnd(40);
    const detail = page.action === 'ignored' ? '(failed in snapshot)' : `${page.chunks} chunks`;
    console.log(`  ${path} ${page.action.padEnd(9)} ${detail}${page.error ? `   ${page.error}` : ''}`);
  }
  console.log('');
  console.log(
    `pages: inserted=${report.inserted} updated=${report.updated} skipped=${report.skipped} ` +
      `failed=${report.failed} ignored=${report.ignored}`,
  );
  console.log(`chunks: indexed=${report.chunksIndexed} failed=${report.chunksFailed}`);
  console.log(`duration: ${(report.durationMs / 1000).toFixed(1)}s`);
}

async function main(): Promise<number> {
  const parsed = parseImportArgs(process.argv.slice(2));

  if (parsed.kind === 'help') {
    console.log(formatImportHelp());
    return EXIT_OK;
  }
  if (parsed.kind === 'error') {
    console.error(`Error: ${parsed.message}\n`);
    console.error(formatImportHelp());
    return EXIT_ERROR;
  }

  const { snapshotPath, force, dryRun } = parsed.options;

  let snapshot;
  try {
    snapshot = await readSnapshot(resolve(process.cwd(), snapshotPath));
  } catch (err) {
    if (err instanceof SnapshotValidationError) {
      console.error(`Invalid snapshot: ${err.message}`);
      return EXIT_ERROR;
    }
    throw err;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set');
    return EXIT_ERROR;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });
  const provider = buildProvider();
  const indexer = new SitePageIndexerService(db, provider);
  const importer = new SitePageImportService(db, indexer, provider);

  console.log('Site knowledge import');
  console.log(
    `  snapshot:  ${snapshotPath}  (${snapshot.city_slug ?? snapshot.site_url}, ${snapshot.crawled_at}, ${snapshot.pages.length} pages)`,
  );
  console.log(`  rn/br:     ${snapshot.rn} / ${snapshot.br}`);
  console.log(`  provider:  ${provider.modelName()}`);
  console.log(`  mode:      ${dryRun ? 'dry-run' : force ? 'force' : 'incremental'}`);
  console.log('');

  try {
    const report = await importer.importSnapshot(snapshot, { force, dryRun });
    printReport(report);
    return report.failed > 0 || report.chunksFailed > 0 ? EXIT_PARTIAL : EXIT_OK;
  } finally {
    await pool.end();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('Import failed:', err instanceof Error ? err.stack ?? err.message : err);
    process.exit(EXIT_ERROR);
  });
