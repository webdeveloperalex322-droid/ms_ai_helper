import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { DATABASE_TOKEN, DrizzleDB } from '../database/database.module';
import { sql } from 'drizzle-orm';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(@Inject(DATABASE_TOKEN) private readonly db: DrizzleDB) {}

  @Get()
  @ApiOperation({ summary: 'Health check' })
  async check() {
    let dbStatus = 'ok';
    let pgvectorStatus = 'ok';

    try {
      await this.db.execute(sql`SELECT 1`);
    } catch {
      dbStatus = 'error';
    }

    try {
      await this.db.execute(sql`SELECT extversion FROM pg_extension WHERE extname = 'vector'`);
    } catch {
      pgvectorStatus = 'error';
    }

    return {
      status: dbStatus === 'ok' ? 'ok' : 'degraded',
      db: dbStatus,
      pgvector: pgvectorStatus,
      timestamp: new Date().toISOString(),
    };
  }
}
