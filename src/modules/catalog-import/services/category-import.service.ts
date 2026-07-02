import { Injectable, Inject, Logger } from '@nestjs/common';
import { DATABASE_TOKEN, DrizzleDB } from '../../../database/database.module';
import { categories, cities, NewCategory } from '../../../database/schema';
import {
  CATALOG_API_CLIENT_TOKEN,
  CatalogApiClient,
  CategoryApiResponse,
} from '../clients/catalog-api.client.interface';
import { ImportJobService } from './import-job.service';
import { randomUUID } from 'crypto';
import { and, eq, isNotNull, inArray } from 'drizzle-orm';

export interface CategoryImportOptions {
  rn: string;
  target?: string;
  /** If provided, import only this city; otherwise iterate all active cities with a slug. */
  slug?: string;
}

@Injectable()
export class CategoryImportService {
  private readonly logger = new Logger(CategoryImportService.name);

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: DrizzleDB,
    @Inject(CATALOG_API_CLIENT_TOKEN) private readonly apiClient: CatalogApiClient,
    private readonly importJobService: ImportJobService,
  ) {}

  async importCategories(
    options: CategoryImportOptions,
  ): Promise<{ jobId: string; imported: number; errors: number; cities: number }> {
    const rn = options.rn;
    const target = options.target ?? 'WEB';

    const job = await this.importJobService.create({
      jobType: 'category_import',
      rn,
      target,
      status: 'running',
    });

    try {
      const citySlugs = options.slug ? [options.slug] : await this.getActiveCitySlugs(rn);

      let imported = 0;
      let errors = 0;
      let citiesProcessed = 0;

      for (const slug of citySlugs) {
        if (!(await this.importJobService.exists(job.id))) {
          this.logger.warn(`Category import job ${job.id} cancelled by user; stopping.`);
          return { jobId: job.id, imported, errors, cities: citiesProcessed };
        }

        try {
          const { br, categories: fetched } = await this.fetchWithRetry(() =>
            this.apiClient.getCategories(rn, slug, target),
          );

          if (!br) {
            this.logger.warn(`No businessRegion returned for slug=${slug}; skipping.`);
            errors++;
            continue;
          }

          const seenCategoryIds: string[] = [];
          for (const cat of fetched) {
            try {
              await this.upsertCategory(cat, rn, br, target);
              seenCategoryIds.push(cat.categoryId);
              imported++;
            } catch (err) {
              this.logger.warn(`Failed to import category ${cat.categoryId} (${slug}): ${err}`);
              errors++;
            }
          }

          // Soft-retire categories no longer returned — but never on an empty fetch.
          if (seenCategoryIds.length > 0) {
            await this.markUnseen(rn, br, target, seenCategoryIds);
          } else {
            this.logger.warn(
              `Empty category fetch for slug=${slug} (br=${br}); not deactivating anything.`,
            );
          }

          citiesProcessed++;
        } catch (err) {
          this.logger.warn(`Failed to import categories for slug=${slug}: ${err}`);
          errors++;
        }
      }

      await this.importJobService.markSuccess(job.id, {
        imported,
        errors,
        cities: citiesProcessed,
      });
      this.logger.log(
        `Category import completed: ${imported} imported, ${errors} errors, ${citiesProcessed} cities`,
      );

      return { jobId: job.id, imported, errors, cities: citiesProcessed };
    } catch (err) {
      await this.importJobService.markFailed(job.id, String(err));
      throw err;
    }
  }

  private async getActiveCitySlugs(rn: string): Promise<string[]> {
    const rows = await this.db
      .select({ slug: cities.slug })
      .from(cities)
      .where(and(eq(cities.rn, rn), eq(cities.isActive, true), isNotNull(cities.slug)));
    return rows.map((r) => r.slug!).filter(Boolean);
  }

  private async upsertCategory(
    cat: CategoryApiResponse,
    rn: string,
    br: string,
    target: string,
  ): Promise<void> {
    const newCategory: NewCategory = {
      id: randomUUID(),
      rn,
      br,
      target,
      categoryId: cat.categoryId,
      slug: cat.slug,
      name: cat.name,
      parentId: cat.parentId != null ? String(cat.parentId) : null,
      orderIndex: cat.orderIndex ?? null,
      classifierId: cat.classifierId ?? null,
      isDefault: cat.isDefault === true,
      iconUrl: cat.iconUrl ?? null,
      imageUrl: cat.imageUrl ?? null,
      isActive: true,
      rawPayload: cat,
      importedAt: new Date(),
    };

    await this.db
      .insert(categories)
      .values(newCategory)
      .onConflictDoUpdate({
        target: [categories.rn, categories.br, categories.target, categories.categoryId],
        set: {
          slug: newCategory.slug,
          name: newCategory.name,
          parentId: newCategory.parentId,
          orderIndex: newCategory.orderIndex,
          classifierId: newCategory.classifierId,
          isDefault: newCategory.isDefault,
          iconUrl: newCategory.iconUrl,
          imageUrl: newCategory.imageUrl,
          isActive: true,
          rawPayload: newCategory.rawPayload,
          importedAt: newCategory.importedAt,
        },
      });
  }

  /** Mark categories not present in the latest fetch as inactive for this city/channel. */
  private async markUnseen(
    rn: string,
    br: string,
    target: string,
    seenCategoryIds: string[],
  ): Promise<void> {
    const existing = await this.db
      .select({ id: categories.id, categoryId: categories.categoryId })
      .from(categories)
      .where(and(eq(categories.rn, rn), eq(categories.br, br), eq(categories.target, target)));

    const toDeactivate = existing
      .filter((c) => !seenCategoryIds.includes(c.categoryId))
      .map((c) => c.id);

    if (toDeactivate.length === 0) return;

    await this.db
      .update(categories)
      .set({ isActive: false })
      .where(inArray(categories.id, toDeactivate));

    this.logger.log(`Deactivated ${toDeactivate.length} unseen categories for br=${br}`);
  }

  private async fetchWithRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err as Error;
        const delay = Math.pow(2, attempt) * 500;
        this.logger.warn(`Attempt ${attempt} failed: ${err}. Retrying in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw lastError;
  }
}
