import { Injectable, Inject } from '@nestjs/common';
import { DATABASE_TOKEN, DrizzleDB } from '../../../database/database.module';
import { importJobs, NewImportJob, ImportJob } from '../../../database/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

@Injectable()
export class ImportJobService {
  constructor(@Inject(DATABASE_TOKEN) private readonly db: DrizzleDB) {}

  async create(data: Omit<NewImportJob, 'id' | 'startedAt'>): Promise<ImportJob> {
    const [job] = await this.db
      .insert(importJobs)
      .values({ id: randomUUID(), startedAt: new Date(), ...data })
      .returning();
    return job;
  }

  async markSuccess(id: string, stats: Record<string, any>): Promise<void> {
    await this.db
      .update(importJobs)
      .set({ status: 'success', finishedAt: new Date(), stats })
      .where(eq(importJobs.id, id));
  }

  async markFailed(id: string, error: string, stats?: Record<string, any>): Promise<void> {
    await this.db
      .update(importJobs)
      .set({ status: 'failed', finishedAt: new Date(), error, ...(stats ? { stats } : {}) })
      .where(eq(importJobs.id, id));
  }

  /** Returns false if the job row no longer exists (e.g. deleted/cancelled via admin panel). */
  async exists(id: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: importJobs.id })
      .from(importJobs)
      .where(eq(importJobs.id, id))
      .limit(1);
    return rows.length > 0;
  }

  async markPartialFailed(id: string, error: string, stats?: Record<string, any>): Promise<void> {
    await this.db
      .update(importJobs)
      .set({
        status: 'partial_failed',
        finishedAt: new Date(),
        error,
        ...(stats ? { stats } : {}),
      })
      .where(eq(importJobs.id, id));
  }
}
