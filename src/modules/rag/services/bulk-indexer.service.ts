import { Injectable, Inject, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { and, asc, eq, gt, sql, SQL } from 'drizzle-orm';
import { DATABASE_TOKEN, DrizzleDB } from '../../../database/database.module';
import {
  cityProducts,
  products,
  productChunks,
  productEmbeddings,
  type CityProduct,
  type Product,
} from '../../../database/schema';
import type { ProductWithCityData } from '../../catalog/services/catalog.service';
import {
  EMBEDDING_PROVIDER_TOKEN,
  EmbeddingProvider,
} from '../providers/embedding.provider.interface';
import { EmbeddingService } from './embedding.service';
import { SearchableTextBuilderService } from './searchable-text-builder.service';
import {
  DEFAULT_BATCH_SIZE,
  DEFAULT_CONCURRENCY,
  DEFAULT_PAGE_SIZE,
  DEFAULT_RETRIES,
} from '../bulk-index-options';

export interface BulkIndexFilters {
  rn?: string;
  br?: string;
  target?: string;
}

export interface BulkIndexOptions extends BulkIndexFilters {
  force?: boolean;
  dryRun?: boolean;
  batchSize?: number;
  concurrency?: number;
  pageSize?: number;
  retries?: number;
  limit?: number;
  /** Base delay for the retry backoff; lowered in tests. */
  retryBaseDelayMs?: number;
  onProgress?: (progress: BulkIndexProgress) => void;
  /** Soft stop: checked between batches and pages. */
  signal?: AbortSignal;
}

export interface BulkIndexProgress {
  total: number;
  seen: number;
  processed: number;
  skipped: number;
  failed: number;
}

export interface BulkIndexFailure {
  productId: string;
  br: string;
  target: string;
  reason: string;
}

export interface BulkIndexReport {
  total: number;
  processed: number;
  skipped: number;
  failed: number;
  durationMs: number;
  failures: BulkIndexFailure[];
  dryRun: boolean;
  aborted: boolean;
}

/** One catalog row joined with whatever has already been indexed for it. */
export interface BulkIndexCandidateRow {
  cityProduct: CityProduct;
  product: Product;
  chunkId: string | null;
  chunkStatus: string | null;
  embeddingContentHash: string | null;
  embeddingModelName: string | null;
}

interface Candidate {
  product: ProductWithCityData;
  productId: string;
  br: string;
  target: string;
  chunkId?: string;
}

const RETRYABLE_PATTERN =
  /(timeout|timed out|econnreset|econnrefused|etimedout|eai_again|socket hang up|429|rate.?limit|\b5\d\d\b)/i;

/**
 * Walks the whole catalog (or a slice of it) and makes sure every city_products
 * row has an up-to-date searchable chunk and embedding.
 *
 * The query layer sits in two protected methods so the traversal logic can be
 * unit-tested against in-memory rows.
 */
@Injectable()
export class RagBulkIndexerService {
  private readonly logger = new Logger(RagBulkIndexerService.name);

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: DrizzleDB,
    private readonly textBuilder: SearchableTextBuilderService,
    private readonly embeddings: EmbeddingService,
    @Inject(EMBEDDING_PROVIDER_TOKEN) private readonly provider: EmbeddingProvider,
  ) {}

  async run(options: BulkIndexOptions = {}): Promise<BulkIndexReport> {
    const startedAt = Date.now();

    const filters: BulkIndexFilters = {
      rn: options.rn,
      br: options.br,
      target: options.target,
    };
    const force = options.force ?? false;
    const dryRun = options.dryRun ?? false;
    const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
    const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
    const retries = options.retries ?? DEFAULT_RETRIES;
    const retryBaseDelayMs = options.retryBaseDelayMs ?? 1000;
    const modelName = this.provider.modelName();

    const counters = { seen: 0, processed: 0, skipped: 0, failed: 0 };
    const failures: BulkIndexFailure[] = [];
    const total = await this.countCandidates(filters);

    if (total === 0) {
      return this.report(total, counters, failures, dryRun, false, startedAt);
    }

    // Chunks are keyed by (product_id, br, target) while catalog rows carry an
    // extra rn, and the table has no unique constraint — so two rows can race
    // for the same chunk. Collapse them inside the run.
    const seenChunkKeys = new Set<string>();
    const inFlight = new Set<Promise<void>>();
    let batch: Candidate[] = [];
    let afterId: string | null = null;
    let aborted = false;

    const reportProgress = () => {
      options.onProgress?.({ total, ...counters });
    };

    const dispatch = async (items: Candidate[]) => {
      const task = this.processBatch(items, { retries, retryBaseDelayMs })
        .then((batchFailures) => {
          counters.processed += items.length - batchFailures.length;
          counters.failed += batchFailures.length;
          failures.push(...batchFailures);
        })
        .catch((err) => {
          // Should not happen: processBatch converts failures into results.
          counters.failed += items.length;
          failures.push(
            ...items.map((item) => ({
              productId: item.productId,
              br: item.br,
              target: item.target,
              reason: this.describeError(err),
            })),
          );
        })
        .finally(() => {
          reportProgress();
        });

      const tracked = task.finally(() => {
        inFlight.delete(tracked);
      });
      inFlight.add(tracked);

      if (inFlight.size >= concurrency) {
        await Promise.race(inFlight);
      }
    };

    pages: while (true) {
      const rows = await this.fetchPage(filters, afterId, pageSize);
      if (rows.length === 0) {
        break;
      }
      afterId = rows[rows.length - 1].cityProduct.id;

      for (const row of rows) {
        if (options.signal?.aborted) {
          aborted = true;
          break pages;
        }
        if (options.limit !== undefined && counters.seen >= options.limit) {
          break pages;
        }

        counters.seen++;

        const key = `${row.cityProduct.productId}|${row.cityProduct.br}|${row.cityProduct.target}`;
        if (seenChunkKeys.has(key)) {
          counters.skipped++;
          continue;
        }
        seenChunkKeys.add(key);

        const product: ProductWithCityData = { ...row.product, cityProduct: row.cityProduct };
        const contentHash = this.contentHashOf(product);

        if (!force && this.isUpToDate(row, contentHash, modelName)) {
          counters.skipped++;
          continue;
        }

        if (dryRun) {
          counters.processed++;
          continue;
        }

        batch.push({
          product,
          productId: row.cityProduct.productId,
          br: row.cityProduct.br,
          target: row.cityProduct.target,
        });

        if (batch.length >= batchSize) {
          const items = batch;
          batch = [];
          await dispatch(items);
        }
      }

      if (rows.length < pageSize) {
        break;
      }
    }

    if (batch.length > 0) {
      await dispatch(batch);
    }

    await Promise.all(inFlight);

    return this.report(total, counters, failures, dryRun, aborted, startedAt);
  }

  /** Total number of catalog rows matching the filters. */
  protected async countCandidates(filters: BulkIndexFilters): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(cityProducts)
      .innerJoin(products, eq(products.id, cityProducts.productId))
      .where(this.filterCondition(filters));

    return Number(row?.count ?? 0);
  }

  /** One keyset page of catalog rows joined with their chunk and embedding. */
  protected async fetchPage(
    filters: BulkIndexFilters,
    afterId: string | null,
    limit: number,
  ): Promise<BulkIndexCandidateRow[]> {
    const conditions: (SQL | undefined)[] = [this.filterCondition(filters)];
    if (afterId !== null) {
      conditions.push(gt(cityProducts.id, afterId));
    }

    return this.db
      .select({
        cityProduct: cityProducts,
        product: products,
        chunkId: productChunks.id,
        chunkStatus: productChunks.embeddingStatus,
        embeddingContentHash: productEmbeddings.contentHash,
        embeddingModelName: productEmbeddings.modelName,
      })
      .from(cityProducts)
      .innerJoin(products, eq(products.id, cityProducts.productId))
      .leftJoin(
        productChunks,
        and(
          eq(productChunks.productId, cityProducts.productId),
          eq(productChunks.br, cityProducts.br),
          eq(productChunks.target, cityProducts.target),
          eq(productChunks.chunkType, 'main'),
        ),
      )
      .leftJoin(productEmbeddings, eq(productEmbeddings.chunkId, productChunks.id))
      .where(and(...conditions))
      .orderBy(asc(cityProducts.id))
      .limit(limit);
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private filterCondition(filters: BulkIndexFilters): SQL | undefined {
    const conditions: SQL[] = [];
    if (filters.rn) conditions.push(eq(cityProducts.rn, filters.rn));
    if (filters.br) conditions.push(eq(cityProducts.br, filters.br));
    if (filters.target) conditions.push(eq(cityProducts.target, filters.target));

    return conditions.length ? and(...conditions) : undefined;
  }

  private contentHashOf(product: ProductWithCityData): string {
    return createHash('md5').update(this.textBuilder.buildSearchableText(product)).digest('hex');
  }

  private isUpToDate(row: BulkIndexCandidateRow, contentHash: string, modelName: string): boolean {
    return (
      row.chunkStatus === 'ready' &&
      row.embeddingContentHash === contentHash &&
      row.embeddingModelName === modelName
    );
  }

  /** Returns the items that could not be indexed; never throws. */
  private async processBatch(
    items: Candidate[],
    opts: { retries: number; retryBaseDelayMs: number },
  ): Promise<BulkIndexFailure[]> {
    const failures: BulkIndexFailure[] = [];
    const embeddable: Candidate[] = [];

    for (const item of items) {
      try {
        item.chunkId = await this.textBuilder.upsertChunk(item.product);
        embeddable.push(item);
      } catch (err) {
        failures.push(this.failureOf(item, err));
      }
    }

    if (embeddable.length === 0) {
      return failures;
    }

    failures.push(...(await this.embedWithRetries(embeddable, opts)));
    return failures;
  }

  private async embedWithRetries(
    items: Candidate[],
    opts: { retries: number; retryBaseDelayMs: number },
  ): Promise<BulkIndexFailure[]> {
    const byChunkId = new Map(items.map((item) => [item.chunkId!, item]));
    const chunkIds = [...byChunkId.keys()];

    for (let attempt = 1; attempt <= opts.retries; attempt++) {
      try {
        const results = await this.embeddings.buildForChunks(chunkIds);

        return results
          .filter((result) => result.status === 'failed')
          .map((result) => {
            const item = byChunkId.get(result.chunkId)!;
            return {
              productId: item.productId,
              br: item.br,
              target: item.target,
              reason: result.error ?? 'embedding failed',
            };
          });
      } catch (err) {
        const retryable = this.isRetryable(err);

        if (!retryable) {
          this.logger.warn(
            `Batch of ${chunkIds.length} failed permanently: ${this.describeError(err)}`,
          );
          return items.map((item) => this.failureOf(item, err));
        }

        if (attempt < opts.retries) {
          const base = opts.retryBaseDelayMs * 2 ** (attempt - 1);
          await this.sleep(Math.round(base * (0.8 + Math.random() * 0.4)));
          continue;
        }

        // Retries exhausted on a transient-looking error: fall back to one
        // request per item so a single bad item cannot sink the whole batch.
        if (chunkIds.length === 1) {
          return items.map((item) => this.failureOf(item, err));
        }

        return this.embedOneByOne(items);
      }
    }

    return [];
  }

  private async embedOneByOne(items: Candidate[]): Promise<BulkIndexFailure[]> {
    const failures: BulkIndexFailure[] = [];

    for (const item of items) {
      try {
        const [result] = await this.embeddings.buildForChunks([item.chunkId!]);
        if (result?.status === 'failed') {
          failures.push({
            productId: item.productId,
            br: item.br,
            target: item.target,
            reason: result.error ?? 'embedding failed',
          });
        }
      } catch (err) {
        failures.push(this.failureOf(item, err));
      }
    }

    return failures;
  }

  private isRetryable(err: unknown): boolean {
    const status = (err as { status?: number })?.status;
    if (typeof status === 'number') {
      return status === 408 || status === 429 || status >= 500;
    }

    return RETRYABLE_PATTERN.test(this.describeError(err));
  }

  private describeError(err: unknown): string {
    if (err instanceof Error) return err.message;
    return String(err);
  }

  private failureOf(item: Candidate, err: unknown): BulkIndexFailure {
    return {
      productId: item.productId,
      br: item.br,
      target: item.target,
      reason: this.describeError(err),
    };
  }

  private report(
    total: number,
    counters: { processed: number; skipped: number; failed: number },
    failures: BulkIndexFailure[],
    dryRun: boolean,
    aborted: boolean,
    startedAt: number,
  ): BulkIndexReport {
    return {
      total,
      processed: counters.processed,
      skipped: counters.skipped,
      failed: counters.failed,
      durationMs: Date.now() - startedAt,
      failures,
      dryRun,
      aborted,
    };
  }
}
