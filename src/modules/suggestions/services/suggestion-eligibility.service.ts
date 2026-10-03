import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CatalogService } from '../../catalog/services/catalog.service';
import { CategoryResolverService } from '../../catalog/services/category-resolver.service';
import { resolveKind } from './suggestion-context';

/** What the eligibility check needs from the site knowledge base. */
export interface KnowledgeAvailabilityPort {
  hasIndexedKnowledge(rn: string, br: string): Promise<boolean>;
}

export const KNOWLEDGE_AVAILABILITY_PORT = 'KNOWLEDGE_AVAILABILITY_PORT';

export interface EligibilityCandidate {
  id: string;
  payload: { intent?: string; slots?: Record<string, any> } | null;
  availabilityRules?: Record<string, any> | null;
}

const PRODUCT_CACHE_TTL_MS = 60 * 1000;
const KNOWLEDGE_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CONCURRENT_CHECKS = 8;

interface CacheEntry {
  value: boolean;
  expiresAt: number;
}

/**
 * Decides which suggestions may be shown in a city (spec 012).
 *
 * A product suggestion needs matching products; a service question needs an
 * indexed knowledge base for that city — running the product check on it would
 * pass on any product at all and surface a suggestion that can only answer
 * with a refusal (FR-015, FR-016).
 *
 * Checks run in bounded parallel with a short cache: the catalogue of
 * suggestions is large enough that one query per suggestion per request would
 * blow the latency budget.
 */
@Injectable()
export class SuggestionEligibilityService {
  private readonly logger = new Logger(SuggestionEligibilityService.name);
  private readonly productCache = new Map<string, CacheEntry>();
  private readonly knowledgeCache = new Map<string, CacheEntry>();

  constructor(
    private readonly catalogService: CatalogService,
    private readonly categoryResolver: CategoryResolverService,
    private readonly config: ConfigService,
    @Optional()
    @Inject(KNOWLEDGE_AVAILABILITY_PORT)
    private readonly knowledge?: KnowledgeAvailabilityPort,
  ) {}

  /** Ids of the suggestions that may be shown. */
  async eligibleIds(
    candidates: EligibilityCandidate[],
    rn: string,
    br: string,
    target: string,
  ): Promise<Set<string>> {
    const eligible = new Set<string>();
    if (!candidates.length) return eligible;

    const hideEmpty = this.config?.get<boolean>('HIDE_EMPTY_SUGGESTIONS') ?? true;

    const services = candidates.filter((c) => resolveKind(c.payload) === 'service');
    const products = candidates.filter((c) => resolveKind(c.payload) !== 'service');

    if (services.length) {
      const available = await this.hasKnowledge(rn, br);
      if (available) services.forEach((c) => eligible.add(c.id));
    }

    for (let i = 0; i < products.length; i += MAX_CONCURRENT_CHECKS) {
      const batch = products.slice(i, i + MAX_CONCURRENT_CHECKS);

      const results = await Promise.all(
        batch.map(async (candidate) => {
          const rules = candidate.availabilityRules ?? {};
          if (!rules.check_products_exist || !hideEmpty) return true;

          return this.hasProducts(candidate, rn, br, target, rules);
        }),
      );

      results.forEach((ok, index) => {
        if (ok) eligible.add(batch[index].id);
      });
    }

    return eligible;
  }

  /** A city without an indexed knowledge base hides every service question. */
  private async hasKnowledge(rn: string, br: string): Promise<boolean> {
    if (!this.knowledge) return false;

    const key = `${rn}|${br}`;
    const cached = this.knowledgeCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    try {
      const value = await this.knowledge.hasIndexedKnowledge(rn, br);
      this.knowledgeCache.set(key, { value, expiresAt: Date.now() + KNOWLEDGE_CACHE_TTL_MS });
      return value;
    } catch (err) {
      this.logger.warn(`Knowledge availability check failed for ${key}: ${err}`);
      return false;
    }
  }

  private async hasProducts(
    candidate: EligibilityCandidate,
    rn: string,
    br: string,
    target: string,
    rules: Record<string, any>,
  ): Promise<boolean> {
    const key = `${rn}|${br}|${target}|${candidate.id}`;
    const cached = this.productCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const value = await this.checkProducts(candidate, rn, br, target, rules);
    this.productCache.set(key, { value, expiresAt: Date.now() + PRODUCT_CACHE_TTL_MS });
    return value;
  }

  private async checkProducts(
    candidate: EligibilityCandidate,
    rn: string,
    br: string,
    target: string,
    rules: Record<string, any>,
  ): Promise<boolean> {
    const slots = candidate.payload?.slots ?? {};

    try {
      // Same resolution as the answer path, otherwise presets carrying a category slug are
      // hidden although the city has matching products.
      const resolved = await this.categoryResolver.resolve(rn, target, slots.category);

      const products = await this.catalogService.findByCity(rn, br, target, {
        categoryIds: resolved.matched ? resolved.categoryIds : undefined,
        categoryNames: resolved.matched ? resolved.categoryNames : undefined,
        preferredIngredients: slots.preferred_ingredients,
        excludedIngredients: slots.excluded_ingredients,
        budgetMax: slots.budget_max ?? undefined,
        spicy: slots.spicy ?? undefined,
        caloriesMax: slots.calories_max ?? undefined,
      });

      const minCount = rules.min_products_count ?? 1;
      return products.length >= minCount;
    } catch {
      return true; // If the check itself fails, show the suggestion anyway.
    }
  }
}
