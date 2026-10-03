import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { DATABASE_TOKEN, DrizzleDB } from '../../../database/database.module';
import { assistantSuggestions } from '../../../database/schema';
import { eq, and } from 'drizzle-orm';
import {
  matchesContext,
  normalizeScreenContext,
  resolveKind,
  type ScreenContext,
  type SuggestionKind,
} from './suggestion-context';
import { SuggestionEligibilityService } from './suggestion-eligibility.service';
import { SuggestionSelectorService, type SelectionCandidate } from './suggestion-selector.service';
import { DayPartService } from './day-part.service';
import { SuggestionStatsService } from './suggestion-stats.service';

export interface SuggestionListItem {
  id: string;
  code: string;
  title: string;
  sort_order: number;
  kind: SuggestionKind;
  payload_preview: {
    intent: string;
    category?: string;
    tags?: string[];
  };
}

export interface SuggestionQueryOptions {
  /** Unit of rotation: the same session sees the same set (spec 012, FR-012). */
  sessionId?: string;
}

/**
 * Serves the short set of preset suggestions for a city screen (spec 012).
 *
 * The whole catalogue is never returned: hard filters narrow it to what the
 * city can actually answer, then `SuggestionSelectorService` draws the set.
 */
@Injectable()
export class SuggestionService {
  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: DrizzleDB,
    private readonly config: ConfigService,
    private readonly eligibility: SuggestionEligibilityService,
    private readonly selector: SuggestionSelectorService,
    private readonly dayPart: DayPartService,
    private readonly stats: SuggestionStatsService,
  ) {}

  async getActiveSuggestions(
    rn: string,
    br: string,
    target: string,
    screenContext: string = 'catalog',
    options: SuggestionQueryOptions = {},
  ): Promise<SuggestionListItem[]> {
    const context = normalizeScreenContext(screenContext);
    const now = new Date();

    const rows = await this.db
      .select()
      .from(assistantSuggestions)
      .where(
        and(
          eq(assistantSuggestions.rn, rn),
          eq(assistantSuggestions.enabled, true),
          eq(assistantSuggestions.target, target),
        ),
      );

    const passed = rows.filter((row) => this.passesHardFilters(row, br, context, now));
    if (!passed.length) return [];

    const eligible = await this.eligibility.eligibleIds(
      passed.map((row) => ({
        id: row.id,
        payload: row.payload as any,
        availabilityRules: row.availabilityRules as any,
      })),
      rn,
      br,
      target,
    );

    const candidates: SelectionCandidate[] = passed
      .filter((row) => eligible.has(row.id))
      .map((row) => {
        const payload = row.payload as any;

        return {
          id: row.id,
          code: row.code,
          title: row.title,
          sortOrder: row.sortOrder,
          kind: resolveKind(payload),
          scenario: payload?.slots?.scenario ?? null,
        };
      });

    if (!candidates.length) return [];

    const stats = this.stats ? await this.stats.forNetwork(rn, target) : null;

    const selected = this.selector.select({
      candidates,
      stats,
      limit: this.config?.get<number>('MAX_SUGGESTIONS_ON_SCREEN') ?? 6,
      context,
      // Without a session id the set is still valid, only not stable (FR-012a).
      seed: options.sessionId ? `${options.sessionId}|${rn}|${br}|${target}` : randomUUID(),
      currentDayPart: this.dayPart?.current(now) ?? null,
      dayPartOf: this.dayPart ? (scenario) => this.dayPart.dayPartOf(scenario) : null,
    });

    const byId = new Map(passed.map((row) => [row.id, row]));

    return selected.map((candidate) => {
      const row = byId.get(candidate.id)!;
      const payload = row.payload as any;

      return {
        id: row.id,
        code: row.code,
        title: row.title,
        sort_order: row.sortOrder,
        kind: candidate.kind,
        payload_preview: {
          intent: payload?.intent,
          category: payload?.slots?.category,
          tags: payload?.slots?.tags,
        },
      };
    });
  }

  private passesHardFilters(
    row: typeof assistantSuggestions.$inferSelect,
    br: string,
    context: ScreenContext,
    now: Date,
  ): boolean {
    if (!matchesContext(row, context)) return false;

    if (row.activeFrom && row.activeFrom > now) return false;
    if (row.activeTo && row.activeTo < now) return false;

    const allowedBr = row.allowedBr as string[] | null;
    if (allowedBr?.length && !allowedBr.includes(br)) return false;

    return true;
  }
}
