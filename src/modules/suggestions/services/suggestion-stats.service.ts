import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sql } from 'drizzle-orm';
import { DATABASE_TOKEN, DrizzleDB } from '../../../database/database.module';
import { assistantSuggestionEvents } from '../../../database/schema';
import type { SuggestionStatsEntry } from './suggestion-selector.service';

const CACHE_TTL_MS = 60 * 1000;
const DEFAULT_WINDOW_DAYS = 30;

interface CacheEntry {
  stats: Map<string, SuggestionStatsEntry>;
  expiresAt: number;
}

/**
 * Shown/clicked counters per suggestion (spec 012, FR-024, FR-025).
 *
 * Aggregated per network and channel, not per city: one city rarely gathers
 * enough impressions to trust a click share. One query per network-channel per
 * minute; anything going wrong degrades to empty statistics, which the
 * selector reads as "order by what the admin set".
 */
@Injectable()
export class SuggestionStatsService {
  private readonly logger = new Logger(SuggestionStatsService.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: DrizzleDB,
    private readonly config: ConfigService,
  ) {}

  async forNetwork(rn: string, target: string): Promise<Map<string, SuggestionStatsEntry>> {
    const key = `${rn}|${target}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.stats;

    const stats = await this.load(rn, target);
    this.cache.set(key, { stats, expiresAt: Date.now() + CACHE_TTL_MS });
    return stats;
  }

  private async load(rn: string, target: string): Promise<Map<string, SuggestionStatsEntry>> {
    const windowDays =
      this.config?.get<number>('SUGGESTIONS_STATS_WINDOW_DAYS') ?? DEFAULT_WINDOW_DAYS;

    const stats = new Map<string, SuggestionStatsEntry>();
    if (windowDays <= 0) return stats;

    try {
      const rows = await this.db
        .select({
          suggestionId: assistantSuggestionEvents.suggestionId,
          shown: sql<number>`count(*) filter (where ${assistantSuggestionEvents.eventType} = 'suggestion_shown')`,
          clicked: sql<number>`count(*) filter (where ${assistantSuggestionEvents.eventType} = 'suggestion_clicked')`,
        })
        .from(assistantSuggestionEvents)
        .where(
          sql`${assistantSuggestionEvents.rn} = ${rn}
            and ${assistantSuggestionEvents.target} = ${target}
            and ${assistantSuggestionEvents.suggestionId} is not null
            and ${assistantSuggestionEvents.createdAt} > now() - ${sql.raw(`interval '${Number(windowDays)} days'`)}`,
        )
        .groupBy(assistantSuggestionEvents.suggestionId);

      for (const row of rows) {
        if (!row.suggestionId) continue;
        stats.set(row.suggestionId, {
          shown: Number(row.shown) || 0,
          clicked: Number(row.clicked) || 0,
        });
      }
    } catch (err) {
      // Ranking is a nicety; the screen must still answer (ADR-005).
      this.logger.warn(`Suggestion statistics unavailable for ${rn}|${target}: ${err}`);
    }

    return stats;
  }
}
