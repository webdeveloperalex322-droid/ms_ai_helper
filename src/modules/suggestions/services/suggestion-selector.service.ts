import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  seededRandom,
  weightedSampleWithoutReplacement,
} from '../../../common/random/seeded-random';
import { isProfileForContext, type ScreenContext, type SuggestionKind } from './suggestion-context';

/** One suggestion the selector may put on the screen. */
export interface SelectionCandidate {
  id: string;
  code: string;
  title: string;
  sortOrder: number;
  kind: SuggestionKind;
  /** Scenario from the payload slots; drives the day-part weight. */
  scenario?: string | null;
}

export interface SuggestionStatsEntry {
  shown: number;
  clicked: number;
}

export interface SelectionInput {
  candidates: SelectionCandidate[];
  limit: number;
  context: ScreenContext;
  /** Session id (or a per-request random value) — the unit of rotation. */
  seed: string;
  stats?: Map<string, SuggestionStatsEntry> | null;
  /** Current day part, e.g. `lunch`. Absent means no day-part weighting. */
  currentDayPart?: string | null;
  /** Maps a suggestion scenario onto a day part. Absent means no weighting. */
  dayPartOf?: ((scenario: string | null | undefined) => string | null) | null;
}

interface WeightedCandidate {
  candidate: SelectionCandidate;
  weight: number;
  isProfile: boolean;
}

const DEFAULTS = {
  serviceQuotaMin: 1,
  serviceQuotaMax: 2,
  statsMinImpressions: 50,
  ctrWeight: 2.0,
  explorationBonus: 0.15,
  dayPartBoost: 1.5,
  contextBoost: 2.0,
};

/**
 * Picks the short set shown on screen (spec 012).
 *
 * The admin's `sort_order` is the prior, the share of clicks, the day part and
 * the screen context are multipliers, and the final pick is a weighted draw
 * seeded from the session id: stable inside a visit, different between visits,
 * without storing the issued set anywhere.
 */
@Injectable()
export class SuggestionSelectorService {
  constructor(private readonly config: ConfigService) {}

  select(input: SelectionInput): SelectionCandidate[] {
    const limit = Math.max(input.limit, 0);
    if (!limit || !input.candidates.length) return [];

    const random = seededRandom(`${input.seed}|${input.context}`);
    const weighted = input.candidates.map((candidate) => this.weigh(candidate, input));

    const picked: WeightedCandidate[] = [];
    const remaining = new Set(weighted);

    if (input.context === 'catalog') {
      // 1-2 slots go to service questions when the city has any (FR-010).
      const services = weighted.filter((w) => w.candidate.kind === 'service');
      const quota = this.serviceQuota(services.length, limit);
      this.draw(services, quota, random, picked, remaining);

      const products = weighted.filter((w) => w.candidate.kind === 'product');
      this.draw(products, limit - picked.length, random, picked, remaining);
    } else {
      // The screen's own kind holds at least two thirds of the set (FR-019, FR-020).
      const profile = weighted.filter((w) => w.isProfile);
      const floor = Math.min(Math.ceil((2 / 3) * limit), profile.length);
      this.draw(profile, floor, random, picked, remaining);

      const rest = weighted.filter((w) => !w.isProfile);
      this.draw(rest, limit - picked.length, random, picked, remaining);
    }

    // Whatever the quotas left unfilled is topped up from the rest (FR-011).
    if (picked.length < limit) {
      this.draw([...remaining], limit - picked.length, random, picked, remaining);
    }

    return picked
      .sort((a, b) => b.weight - a.weight || a.candidate.sortOrder - b.candidate.sortOrder)
      .map((w) => w.candidate);
  }

  private draw(
    pool: WeightedCandidate[],
    count: number,
    random: () => number,
    picked: WeightedCandidate[],
    remaining: Set<WeightedCandidate>,
  ): void {
    if (count <= 0) return;

    const available = pool.filter((item) => remaining.has(item));
    const chosen = weightedSampleWithoutReplacement(
      available,
      (item) => item.weight,
      count,
      random,
    );

    for (const item of chosen) {
      picked.push(item);
      remaining.delete(item);
    }
  }

  private serviceQuota(serviceCount: number, limit: number): number {
    if (!serviceCount) return 0;

    const min = this.num('SUGGESTIONS_SERVICE_QUOTA_MIN', DEFAULTS.serviceQuotaMin);
    const max = this.num('SUGGESTIONS_SERVICE_QUOTA_MAX', DEFAULTS.serviceQuotaMax);

    return Math.min(Math.max(min, Math.min(max, serviceCount)), serviceCount, limit);
  }

  private weigh(candidate: SelectionCandidate, input: SelectionInput): WeightedCandidate {
    const base = 1 / (1 + Math.max(candidate.sortOrder, 0) / 100);
    const isProfile = isProfileForContext(candidate, candidate.kind, input.context);

    const weight =
      base *
      this.ctrFactor(candidate, input.stats) *
      this.dayPartFactor(candidate, input) *
      (isProfile ? this.num('SUGGESTIONS_CONTEXT_BOOST', DEFAULTS.contextBoost) : 1);

    return { candidate, weight, isProfile };
  }

  /**
   * A click share only counts once the suggestion has been shown enough times
   * (FR-026); until then it gets a small exploration bonus so a fresh
   * suggestion still reaches the screen (FR-028).
   */
  private ctrFactor(candidate: SelectionCandidate, stats: SelectionInput['stats']): number {
    const exploration = 1 + this.num('SUGGESTIONS_EXPLORATION_BONUS', DEFAULTS.explorationBonus);
    const entry = stats?.get(candidate.id);
    if (!entry || entry.shown <= 0) return exploration;

    const threshold = this.num('SUGGESTIONS_STATS_MIN_IMPRESSIONS', DEFAULTS.statsMinImpressions);
    if (entry.shown < threshold) return exploration;

    const ctr = Math.min(Math.max(entry.clicked / entry.shown, 0), 1);
    return 1 + this.num('SUGGESTIONS_CTR_WEIGHT', DEFAULTS.ctrWeight) * ctr;
  }

  private dayPartFactor(candidate: SelectionCandidate, input: SelectionInput): number {
    if (!input.currentDayPart || !input.dayPartOf) return 1;

    const own = input.dayPartOf(candidate.scenario);
    if (!own) return 1;

    const boost = this.num('SUGGESTIONS_DAYPART_BOOST', DEFAULTS.dayPartBoost);
    return own === input.currentDayPart ? boost : 1 / boost;
  }

  private num(key: string, fallback: number): number {
    const value = this.config?.get<number>(key);
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }
}
