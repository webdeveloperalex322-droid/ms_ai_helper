/**
 * Test CLI: index a single product into the local RAG.
 *
 * Input: product id (products.id) as shown in admin.
 * Builds a searchable-text chunk + embedding for EVERY city_products row
 * of that product (chunks are keyed by product x br x target).
 *
 * Usage:
 *   pnpm rag:index <productId>
 *   pnpm rag:index <productId> --rn <rn> --br <br> --target <target>   # limit to one combo
 *
 * Honors EMBEDDING_PROVIDER (mock|openai) from .env. Mock works fully offline.
 *
 * Note: standalone script (no Nest DI) — tsx/esbuild doesn't emit decorator
 * metadata, so services are instantiated manually, like seeds/.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { eq, and } from 'drizzle-orm';
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import type { ConfigService } from '@nestjs/config';
import * as schema from '../src/database/schema';
import { products, cityProducts, productChunks } from '../src/database/schema';
import { SearchableTextBuilderService } from '../src/modules/rag/services/searchable-text-builder.service';
import { EmbeddingService } from '../src/modules/rag/services/embedding.service';
import { MockEmbeddingProvider } from '../src/modules/rag/providers/mock-embedding.provider';
import { OpenAIEmbeddingProvider } from '../src/modules/rag/providers/openai-embedding.provider';
import { AitunnelOpenAIClientService } from '../src/common/llm/aitunnel-openai-client.service';
import type { EmbeddingProvider } from '../src/modules/rag/providers/embedding.provider.interface';
import type { ProductWithCityData } from '../src/modules/catalog/services/catalog.service';

function parseArgs(argv: string[]) {
  const [productId, ...rest] = argv;
  const opts: Record<string, string> = {};
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i]?.replace(/^--/, '');
    if (key) opts[key] = rest[i + 1];
  }
  return { productId, rn: opts.rn, br: opts.br, target: opts.target };
}

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

async function main() {
  const { productId, rn, br, target } = parseArgs(process.argv.slice(2));

  if (!productId) {
    console.error('Usage: pnpm rag:index <productId> [--rn <rn> --br <br> --target <target>]');
    process.exit(1);
  }

  const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
  dotenv.config({ path: resolve(process.cwd(), envFile) });

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set');

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema }) as any;

  const provider = buildProvider();
  const textBuilder = new SearchableTextBuilderService(db);
  const embeddings = new EmbeddingService(db, provider);

  try {
    const conditions = [eq(cityProducts.productId, productId)];
    if (rn) conditions.push(eq(cityProducts.rn, rn));
    if (br) conditions.push(eq(cityProducts.br, br));
    if (target) conditions.push(eq(cityProducts.target, target));

    const rows = await db
      .select()
      .from(cityProducts)
      .innerJoin(products, eq(cityProducts.productId, products.id))
      .where(and(...conditions));

    if (!rows.length) {
      console.error(
        `No city_products found for product ${productId}` +
          (rn || br || target ? ' with given rn/br/target' : ''),
      );
      process.exit(2);
    }

    console.log(`Provider: ${provider.modelName()}`);
    console.log(`Product ${productId}: ${rows.length} city combo(s) to index`);

    for (const row of rows) {
      const product: ProductWithCityData = { ...row.products, cityProduct: row.city_products };
      const { br: cbr, target: ctarget } = row.city_products;

      const chunkId = await textBuilder.upsertChunk(product);
      await embeddings.buildForChunk(chunkId);

      const [chunk] = await db
        .select({ status: productChunks.embeddingStatus })
        .from(productChunks)
        .where(eq(productChunks.id, chunkId))
        .limit(1);

      const mark = chunk?.status === 'ready' ? 'OK  ' : 'FAIL';
      console.log(`  [${mark}] br=${cbr} target=${ctarget} chunk=${chunkId} status=${chunk?.status}`);
    }

    console.log('Done. Rows with status=ready are searchable in RAG.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('rag:index failed:', err);
  process.exit(1);
});
