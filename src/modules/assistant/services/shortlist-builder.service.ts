import { Injectable } from '@nestjs/common';
import { HybridRetrieverService } from '../../rag/services/hybrid-retriever.service';
import { IntentResult, ProductCandidate } from '../providers/llm.provider.interface';
import { CatalogFilters } from '../../catalog/services/catalog.service';

@Injectable()
export class ShortlistBuilderService {
  constructor(private readonly hybridRetriever: HybridRetrieverService) {}

  async build(
    intentResult: IntentResult,
    rn: string,
    br: string,
    target: string,
    retrievalQuery?: string,
  ): Promise<ProductCandidate[]> {
    const slots = intentResult.slots;

    const filters: CatalogFilters = {
      budgetMax: slots.budget_max ?? undefined,
      categoryId: slots.category ?? undefined,
      preferredIngredients: slots.preferred_ingredients ?? undefined,
      excludedIngredients: slots.excluded_ingredients ?? undefined,
      spicy: slots.spicy ?? undefined,
      tags: undefined,
      isAvailable: true,
    };

    const query = retrievalQuery ?? this.buildQuery(intentResult);

    const candidates = await this.hybridRetriever.retrieve({
      query,
      rn,
      br,
      target,
      filters,
      shortlistSize: 30,
    });

    return candidates.map((c) => ({
      product_id: c.product.id,
      name: c.product.name,
      price: parseFloat(String(c.product.cityProduct.price)) || 0,
      currency: c.product.cityProduct.currency ?? 'RUB',
      image_url: c.product.imageUrl ?? undefined,
      ingredients: (c.product.ingredients as string[]) ?? [],
      allergens: (c.product.allergens as string[]) ?? [],
      tags: (c.product.tags as string[]) ?? [],
      category_id: c.product.categoryId ?? undefined,
    }));
  }

  private buildQuery(intent: IntentResult): string {
    const parts: string[] = [];
    const slots = intent.slots;

    if (slots.category) parts.push(slots.category);
    if (slots.preferred_ingredients?.length) parts.push(slots.preferred_ingredients.join(' '));
    if (slots.taste?.length) parts.push(slots.taste.join(' '));
    if (slots.scenario) parts.push(slots.scenario);
    if (slots.product_mentions?.length) parts.push(slots.product_mentions.join(' '));

    return parts.join(' ') || 'роллы суши';
  }
}
