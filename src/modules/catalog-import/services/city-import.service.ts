import { Injectable, Inject, Logger } from '@nestjs/common';
import { DATABASE_TOKEN, DrizzleDB } from '../../../database/database.module';
import { cities, NewCity } from '../../../database/schema';
import {
  CATALOG_API_CLIENT_TOKEN,
  CatalogApiClient,
} from '../clients/catalog-api.client.interface';
import { ImportJobService } from './import-job.service';
import { randomUUID } from 'crypto';

@Injectable()
export class CityImportService {
  private readonly logger = new Logger(CityImportService.name);

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: DrizzleDB,
    @Inject(CATALOG_API_CLIENT_TOKEN) private readonly apiClient: CatalogApiClient,
    private readonly importJobService: ImportJobService,
  ) {}

  async importCities(
    rn: string,
    dryRun = false,
  ): Promise<{ jobId: string; imported: number; errors: number; dryRun?: boolean }> {
    if (dryRun) {
      this.logger.log(`Dry-run city import for rn=${rn}`);
      return { jobId: `dry-run-${randomUUID()}`, imported: 0, errors: 0, dryRun: true };
    }

    const job = await this.importJobService.create({
      jobType: 'city_import',
      rn,
      status: 'running',
    });

    try {
      const citiesData = await this.fetchWithRetry(() => this.apiClient.getCities(rn));
      let imported = 0;
      let errors = 0;

      for (const cityData of citiesData) {
        try {
          const newCity: NewCity = {
            id: randomUUID(),
            rn,
            br: cityData.id ?? cityData.br,
            name: cityData.name,
            isActive: cityData.isActive !== false,
            rawPayload: cityData,
            importedAt: new Date(),
          };

          await this.db
            .insert(cities)
            .values(newCity)
            .onConflictDoUpdate({
              target: [cities.rn, cities.br],
              set: {
                name: newCity.name,
                isActive: newCity.isActive,
                rawPayload: newCity.rawPayload,
                importedAt: newCity.importedAt,
              },
            });

          imported++;
        } catch (err) {
          this.logger.warn(`Failed to import city ${cityData.id}: ${err}`);
          errors++;
        }
      }

      await this.importJobService.markSuccess(job.id, {
        imported,
        errors,
        total: citiesData.length,
      });
      this.logger.log(`City import completed: ${imported} imported, ${errors} errors`);

      return { jobId: job.id, imported, errors };
    } catch (err) {
      await this.importJobService.markFailed(job.id, String(err));
      throw err;
    }
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
