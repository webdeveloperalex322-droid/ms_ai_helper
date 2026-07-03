import { Injectable, Inject, Logger } from '@nestjs/common';
import { DATABASE_TOKEN, DrizzleDB } from '../../../database/database.module';
import { productAttributes } from '../../../database/schema';
import {
  CATALOG_API_CLIENT_TOKEN,
  CatalogApiClient,
} from '../clients/catalog-api.client.interface';
import { ImportJobService } from './import-job.service';
import { sql } from 'drizzle-orm';

@Injectable()
export class AttributeImportService {
  private readonly logger = new Logger(AttributeImportService.name);

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: DrizzleDB,
    @Inject(CATALOG_API_CLIENT_TOKEN) private readonly apiClient: CatalogApiClient,
    private readonly importJobService: ImportJobService,
  ) {}

  async importAttributes(rn: string): Promise<{ jobId: string; imported: number }> {
    const job = await this.importJobService.create({
      jobType: 'attribute_import',
      rn,
      br: null,
      target: 'WEB',
      status: 'running',
    });

    try {
      const raw = await this.apiClient.getAttributes(rn);
      let imported = 0;

      for (const entry of raw) {
        const externalId = entry.attribute?.id ?? entry.id;
        const name = entry.attribute?.name ?? '';
        const groupName = entry.attribute?.group?.name ?? null;

        await this.db
          .insert(productAttributes)
          .values({
            rn,
            externalId,
            name,
            groupName,
            isActive: true,
            rawPayload: JSON.stringify(entry),
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [productAttributes.rn, productAttributes.externalId],
            set: {
              name,
              groupName,
              isActive: true,
              rawPayload: JSON.stringify(entry),
              updatedAt: sql`now()`,
            },
          });

        imported++;
      }

      await this.importJobService.markSuccess(job.id, { imported });
      this.logger.log(`Attribute import done: ${imported} upserted for rn=${rn}`);
      return { jobId: job.id, imported };
    } catch (err) {
      await this.importJobService.markFailed(job.id, String(err));
      throw err;
    }
  }
}
