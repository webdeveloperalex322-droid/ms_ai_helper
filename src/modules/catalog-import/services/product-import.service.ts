import { Injectable, Inject, Logger } from '@nestjs/common';
import { DATABASE_TOKEN, DrizzleDB } from '../../../database/database.module';
import { products, cityProducts, cities, categories } from '../../../database/schema';
import {
  CATALOG_API_CLIENT_TOKEN,
  CatalogApiClient,
} from '../clients/catalog-api.client.interface';
import { ProductNormalizerService } from './product-normalizer.service';
import { ImportJobService } from './import-job.service';
import { randomUUID } from 'crypto';
import { eq, and, asc, notInArray } from 'drizzle-orm';
import { productAttributes } from '../../../database/schema';

export interface ProductImportOptions {
  rn: string;
  br?: string;
  target: string;
  mode: 'full' | 'incremental' | 'dry-run';
  categoryIds?: string[];
  ids?: string[];
}

const DEFAULT_CATEGORY_IDS = ['roll', 'set', 'drink', 'sauce', 'dessert', 'hot'];

/** Thrown when the import job row was deleted mid-run — signals a user-requested cancellation. */
export class ImportCancelledError extends Error {
  constructor(public readonly jobId: string) {
    super(`Import job ${jobId} was cancelled`);
    this.name = 'ImportCancelledError';
  }
}

@Injectable()
export class ProductImportService {
  private readonly logger = new Logger(ProductImportService.name);

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: DrizzleDB,
    @Inject(CATALOG_API_CLIENT_TOKEN) private readonly apiClient: CatalogApiClient,
    private readonly normalizer: ProductNormalizerService,
    private readonly importJobService: ImportJobService,
  ) {}

  async importProducts(
    options: ProductImportOptions,
  ): Promise<{ jobId: string; imported: number }> {
    if (options.mode === 'dry-run') {
      return this.dryRun(options);
    }

    const job = await this.importJobService.create({
      jobType: 'product_import',
      rn: options.rn,
      br: options.br ?? null,
      target: options.target,
      status: 'running',
    });

    try {
      let imported = 0;

      if (options.mode === 'incremental' && options.ids?.length) {
        imported = await this.importByIds(options, job.id);
      } else {
        imported = await this.importFull(options, job.id);
      }

      await this.importJobService.markSuccess(job.id, { imported });
      return { jobId: job.id, imported };
    } catch (err) {
      if (err instanceof ImportCancelledError) {
        // Job row was deleted via admin panel — nothing to mark, just stop.
        this.logger.warn(`Import job ${job.id} cancelled by user; stopping.`);
        return { jobId: job.id, imported: 0 };
      }
      await this.importJobService.markFailed(job.id, String(err));
      throw err;
    }
  }

  /** Aborts the run if the job row was deleted (cancellation signal from admin panel). */
  private async ensureNotCancelled(jobId: string): Promise<void> {
    if (!(await this.importJobService.exists(jobId))) {
      throw new ImportCancelledError(jobId);
    }
  }

  private async importFull(options: ProductImportOptions, jobId: string): Promise<number> {
    const targetBrs = options.br ? [options.br] : await this.getActiveBrs(options.rn);
    const attrMap = await this.loadAttributeMap(options.rn);

    let totalImported = 0;

    for (const br of targetBrs) {
      await this.ensureNotCancelled(jobId);

      // Prefer an explicit override, else the imported (network-global) category slugs,
      // else fall back to the built-in defaults.
      const categorySlugs =
        options.categoryIds ?? (await this.resolveCategorySlugs(options.rn, options.target));

      // Track which product IDs were seen in this import run
      const seenExternalIds: string[] = [];

      for (const categorySlug of categorySlugs) {
        await this.ensureNotCancelled(jobId);
        try {
          const rawProducts = await this.fetchWithRetry(() =>
            this.apiClient.getProductsByCategory(options.rn, br, options.target, categorySlug),
          );

          for (const raw of rawProducts) {
            await this.upsertProduct(raw, options.rn, br, options.target, attrMap);
            seenExternalIds.push(raw.id);
            totalImported++;
          }
        } catch (err) {
          this.logger.warn(`Failed to import category ${categorySlug} for br ${br}: ${err}`);
        }
      }

      // Step 6 of TDD algorithm: mark products not seen in this run as unavailable
      if (seenExternalIds.length > 0) {
        await this.markUnseen(options.rn, br, options.target, seenExternalIds);
      } else {
        // Suspicious: empty result — do not mark all products unavailable
        this.logger.warn(
          `Suspicious: import for br=${br} returned 0 products. Not marking anything unavailable.`,
        );
      }
    }

    return totalImported;
  }

  /**
   * Mark city_products as unavailable for products not present in the latest import.
   * Uses external product IDs to find which product records need to be updated.
   */
  private async markUnseen(
    rn: string,
    br: string,
    target: string,
    seenExternalIds: string[],
  ): Promise<void> {
    // Find product IDs for the seen external IDs
    const seenProducts = await this.db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.rn, rn)));

    const seenProductIds = seenProducts
      .filter((p) => seenExternalIds.includes(p.id))
      .map((p) => p.id);

    if (seenProductIds.length === 0) return;

    // Find all current city_products for this br/target
    const allCityProds = await this.db
      .select({ id: cityProducts.id, productId: cityProducts.productId })
      .from(cityProducts)
      .where(
        and(eq(cityProducts.rn, rn), eq(cityProducts.br, br), eq(cityProducts.target, target)),
      );

    const toDisable = allCityProds
      .filter((cp) => !seenProductIds.includes(cp.productId))
      .map((cp) => cp.id);

    if (toDisable.length === 0) return;

    await this.db
      .update(cityProducts)
      .set({ isAvailable: false })
      .where(and(eq(cityProducts.rn, rn), notInArray(cityProducts.id, toDisable)));

    this.logger.log(`Marked ${toDisable.length} products unavailable for br=${br}`);
  }

  private async importByIds(options: ProductImportOptions, jobId: string): Promise<number> {
    const ids = options.ids!;
    const targetBrs = options.br ? [options.br] : await this.getActiveBrs(options.rn);
    const attrMap = await this.loadAttributeMap(options.rn);
    let imported = 0;

    for (const br of targetBrs) {
      await this.ensureNotCancelled(jobId);
      const rawProducts = await this.fetchWithRetry(() =>
        this.apiClient.getProductsByIds(options.rn, br, options.target, ids),
      );
      for (const raw of rawProducts) {
        await this.upsertProduct(raw, options.rn, br, options.target, attrMap);
        imported++;
      }
    }

    return imported;
  }

  private async dryRun(
    options: ProductImportOptions,
  ): Promise<{ jobId: string; imported: number }> {
    this.logger.log(`Dry-run mode: would import products for rn=${options.rn}`);
    return { jobId: `dry-run-${randomUUID()}`, imported: 0 };
  }

  private async upsertProduct(
    raw: any,
    rn: string,
    br: string,
    target: string,
    attrMap: Map<string, string> = new Map(),
  ): Promise<void> {
    const enriched = this.enrichAttributes(raw, attrMap);
    const normalized = this.normalizer.normalize(enriched, rn, br, target);

    const [product] = await this.db
      .insert(products)
      .values({ id: randomUUID(), ...normalized.product })
      .onConflictDoUpdate({
        target: [products.rn, products.externalProductId],
        set: {
          name: normalized.product.name,
          categoryId: normalized.product.categoryId,
          categoryName: normalized.product.categoryName,
          description: normalized.product.description,
          ingredients: normalized.product.ingredients,
          allergens: normalized.product.allergens,
          tags: normalized.product.tags,
          weight: normalized.product.weight,
          pieces: normalized.product.pieces,
          calories: normalized.product.calories,
          protein: normalized.product.protein,
          fat: normalized.product.fat,
          carbs: normalized.product.carbs,
          imageUrl: normalized.product.imageUrl,
          rawPayload: normalized.product.rawPayload,
          attributes: normalized.product.attributes,
          updatedAt: new Date(),
        },
      })
      .returning();

    await this.db
      .insert(cityProducts)
      .values({
        id: randomUUID(),
        ...normalized.cityProduct,
        productId: product.id,
        importedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [cityProducts.rn, cityProducts.br, cityProducts.target, cityProducts.productId],
        set: {
          price: normalized.cityProduct.price,
          oldPrice: normalized.cityProduct.oldPrice,
          isAvailable: normalized.cityProduct.isAvailable,
          isValid: normalized.cityProduct.isValid,
          invalidReason: normalized.cityProduct.invalidReason,
          rawPayload: normalized.cityProduct.rawPayload,
          importedAt: new Date(),
        },
      });
  }

  /**
   * Category slugs to request products for, from the imported (network-global) `categories`
   * table: active, non-default (skip virtual aggregates), ordered by orderIndex.
   * Falls back to the built-in defaults (with a warning) when none are stored.
   */
  private async resolveCategorySlugs(rn: string, target: string): Promise<string[]> {
    const rows = await this.db
      .select({ slug: categories.slug })
      .from(categories)
      .where(
        and(
          eq(categories.rn, rn),
          eq(categories.target, target),
          eq(categories.isActive, true),
          eq(categories.isDefault, false),
        ),
      )
      .orderBy(asc(categories.orderIndex));

    const slugs = rows.map((r) => r.slug).filter(Boolean);
    if (slugs.length === 0) {
      this.logger.warn(
        `No stored categories for rn=${rn} target=${target}; falling back to DEFAULT_CATEGORY_IDS.`,
      );
      return DEFAULT_CATEGORY_IDS;
    }
    return slugs;
  }

  private async getActiveBrs(rn: string): Promise<string[]> {
    const activeCities = await this.db
      .select({ br: cities.br })
      .from(cities)
      .where(and(eq(cities.rn, rn), eq(cities.isActive, true)));
    return activeCities.map((c) => c.br);
  }

  private async loadAttributeMap(rn: string): Promise<Map<string, string>> {
    const rows = await this.db
      .select({ externalId: productAttributes.externalId, name: productAttributes.name })
      .from(productAttributes)
      .where(and(eq(productAttributes.rn, rn), eq(productAttributes.isActive, true)));
    return new Map(rows.map((r) => [r.externalId, r.name]));
  }

  private enrichAttributes(raw: any, attrMap: Map<string, string>): any {
    if (!raw.attributes?.length || attrMap.size === 0) return raw;
    return {
      ...raw,
      attributes: raw.attributes.map((a: any) => ({
        ...a,
        name: a.name ?? attrMap.get(a.id),
      })),
    };
  }

  private async fetchWithRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err as Error;
        const delay = Math.pow(2, attempt) * 500;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw lastError;
  }
}
