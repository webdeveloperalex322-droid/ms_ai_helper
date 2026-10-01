import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DATABASE_TOKEN, DrizzleDB } from '../../../database/database.module';
import { assistantSuggestions } from '../../../database/schema';
import { CatalogService } from '../../catalog/services/catalog.service';
import { CategoryResolverService } from '../../catalog/services/category-resolver.service';
import { eq, and } from 'drizzle-orm';

export interface SuggestionListItem {
  id: string;
  code: string;
  title: string;
  sort_order: number;
  payload_preview: {
    intent: string;
    category?: string;
    tags?: string[];
  };
}

@Injectable()
export class SuggestionService {
  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: DrizzleDB,
    private readonly catalogService: CatalogService,
    private readonly config: ConfigService,
    private readonly categoryResolver: CategoryResolverService,
  ) {}

  async getActiveSuggestions(
    rn: string,
    br: string,
    target: string,
    screenContext = 'catalog',
  ): Promise<SuggestionListItem[]> {
    const now = new Date();

    const suggestions = await this.db
      .select()
      .from(assistantSuggestions)
      .where(
        and(
          eq(assistantSuggestions.rn, rn),
          eq(assistantSuggestions.enabled, true),
          eq(assistantSuggestions.target, target),
        ),
      );

    const maxSuggestions = this.config.get<number>('MAX_SUGGESTIONS_ON_SCREEN') ?? 8;
    const hideEmpty = this.config.get<boolean>('HIDE_EMPTY_SUGGESTIONS') ?? true;

    const filtered: SuggestionListItem[] = [];

    for (const s of suggestions) {
      // Screen context filter
      if (s.screenContext && s.screenContext !== screenContext) continue;

      // Period filter
      if (s.activeFrom && s.activeFrom > now) continue;
      if (s.activeTo && s.activeTo < now) continue;

      // Allowed br filter
      const allowedBr = s.allowedBr as string[] | null;
      if (allowedBr?.length && !allowedBr.includes(br)) continue;

      // Availability check
      const availRules = s.availabilityRules as any;
      if (availRules?.check_products_exist && hideEmpty) {
        const hasProducts = await this.checkProductsExist(s, rn, br, target, availRules);
        if (!hasProducts) continue;
      }

      const payload = s.payload as any;
      filtered.push({
        id: s.id,
        code: s.code,
        title: s.title,
        sort_order: s.sortOrder,
        payload_preview: {
          intent: payload?.intent,
          category: payload?.slots?.category,
          tags: payload?.slots?.tags,
        },
      });

      if (filtered.length >= maxSuggestions) break;
    }

    return filtered.sort((a, b) => a.sort_order - b.sort_order);
  }

  private async checkProductsExist(
    suggestion: any,
    rn: string,
    br: string,
    target: string,
    rules: any,
  ): Promise<boolean> {
    const payload = suggestion.payload as any;
    const slots = payload?.slots ?? {};

    try {
      // Same resolution as the answer path, otherwise presets carrying a category slug are
      // hidden although the city has matching products.
      const resolved = await this.categoryResolver.resolve(rn, target, slots.category);

      const products = await this.catalogService.findByCity(rn, br, target, {
        categoryIds: resolved.matched ? resolved.categoryIds : undefined,
        preferredIngredients: slots.preferred_ingredients,
        excludedIngredients: slots.excluded_ingredients,
        budgetMax: slots.budget_max ?? undefined,
        spicy: slots.spicy ?? undefined,
      });

      const minCount = rules.min_products_count ?? 1;
      return products.length >= minCount;
    } catch {
      return true; // If check fails, show suggestion anyway
    }
  }
}
