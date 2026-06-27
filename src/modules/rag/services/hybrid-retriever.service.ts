import { Injectable } from '@nestjs/common';
import { VectorSearchService } from './vector-search.service';
import { KeywordSearchService } from './keyword-search.service';
import { EmbeddingService } from './embedding.service';
import {
  CatalogService,
  CatalogFilters,
  ProductWithCityData,
} from '../../catalog/services/catalog.service';

export interface RetrievalQuery {
  query: string;
  rn: string;
  br: string;
  target: string;
  filters?: CatalogFilters;
  shortlistSize?: number;
}

export interface RetrievalCandidate {
  product: ProductWithCityData;
  score: number;
  semanticScore: number;
  keywordScore: number;
}

@Injectable()
export class HybridRetrieverService {
  constructor(
    private readonly vectorSearch: VectorSearchService,
    private readonly keywordSearch: KeywordSearchService,
    private readonly embeddingService: EmbeddingService,
    private readonly catalogService: CatalogService,
  ) {}

  async retrieve(input: RetrievalQuery): Promise<RetrievalCandidate[]> {
    const shortlistSize = input.shortlistSize ?? 30;

    // 1. Embed query
    const queryVector = await this.embeddingService.embedQuery(input.query);

    // 2. Parallel search
    const [vectorResults, keywordResults] = await Promise.all([
      this.vectorSearch
        .search(queryVector, {
          rn: input.rn,
          br: input.br,
          target: input.target,
          topK: 50,
        })
        .catch(() => []),
      this.keywordSearch.search(input.query, input.rn, input.br, input.target, 50).catch(() => []),
    ]);

    // 3. Merge candidates (deduplicate by product_id)
    const candidateMap = new Map<string, { semanticScore: number; keywordScore: number }>();

    for (const r of vectorResults) {
      candidateMap.set(r.productId, { semanticScore: r.score, keywordScore: 0 });
    }

    for (const r of keywordResults) {
      const existing = candidateMap.get(r.productId);
      if (existing) {
        existing.keywordScore = r.score;
      } else {
        candidateMap.set(r.productId, { semanticScore: 0, keywordScore: r.score });
      }
    }

    if (candidateMap.size === 0) {
      // Fallback: get all available products for city
      const allProducts = await this.catalogService.findByCity(
        input.rn,
        input.br,
        input.target,
        input.filters,
      );
      return allProducts.slice(0, shortlistSize).map((p) => ({
        product: p,
        score: 0.5,
        semanticScore: 0,
        keywordScore: 0,
      }));
    }

    // 4. Hydrate products
    const allProducts = await this.catalogService.findByCity(
      input.rn,
      input.br,
      input.target,
      input.filters,
    );

    const productMap = new Map(allProducts.map((p) => [p.id, p]));

    // 5. Score and filter
    const candidates: RetrievalCandidate[] = [];
    for (const [productId, scores] of candidateMap) {
      const product = productMap.get(productId);
      if (!product) continue; // filtered out by catalog filters

      const score = this.computeScore(scores, product, input.filters ?? {});
      candidates.push({ product, score, ...scores });
    }

    // 6. Sort and return shortlist
    return candidates.sort((a, b) => b.score - a.score).slice(0, shortlistSize);
  }

  private computeScore(
    scores: { semanticScore: number; keywordScore: number },
    product: ProductWithCityData,
    filters: CatalogFilters,
  ): number {
    let score = scores.semanticScore * 0.35 + scores.keywordScore * 0.2;

    // Slot match bonus
    let slotMatch = 0;

    if (filters.categoryId && product.categoryId === filters.categoryId) {
      slotMatch += 20;
    }

    if (filters.preferredIngredients?.length) {
      const ingredients = (product.ingredients as string[] | null) ?? [];
      const matches = filters.preferredIngredients.filter((ing) =>
        ingredients.map((i) => i.toLowerCase()).includes(ing.toLowerCase()),
      ).length;
      slotMatch += Math.min(matches * 15, 40);
    }

    if (filters.spicy === false) {
      const tags = (product.tags as string[] | null) ?? [];
      if (!tags.some((t) => ['острый', 'острое', 'spicy'].includes(t.toLowerCase()))) {
        slotMatch += 10;
      }
    }

    score += slotMatch * 0.25;
    score += 0.1; // availability bonus (already filtered)

    return Math.min(score, 1);
  }
}
