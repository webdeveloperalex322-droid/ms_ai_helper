import { Injectable, Inject } from '@nestjs/common';
import { DATABASE_TOKEN, DrizzleDB } from '../../../database/database.module';
import { products, cityProducts, Product, CityProduct } from '../../../database/schema';
import { eq, and, lte } from 'drizzle-orm';

export interface CatalogFilters {
  budgetMax?: number;
  categoryId?: string;
  preferredIngredients?: string[];
  excludedIngredients?: string[];
  spicy?: boolean;
  tags?: string[];
  attributeNames?: string[];
  isAvailable?: boolean;
}

export interface ProductWithCityData extends Product {
  cityProduct: CityProduct;
}

@Injectable()
export class CatalogService {
  constructor(@Inject(DATABASE_TOKEN) private readonly db: DrizzleDB) {}

  async findByCity(
    rn: string,
    br: string,
    target: string,
    filters: CatalogFilters = {},
  ): Promise<ProductWithCityData[]> {
    const conditions = [
      eq(cityProducts.rn, rn),
      eq(cityProducts.br, br),
      eq(cityProducts.target, target),
      eq(cityProducts.isValid, true),
    ];

    if (filters.isAvailable !== false) {
      conditions.push(eq(cityProducts.isAvailable, true));
    }

    if (filters.budgetMax != null) {
      conditions.push(lte(cityProducts.price, String(filters.budgetMax)));
    }

    if (filters.categoryId) {
      conditions.push(eq(products.categoryId, filters.categoryId));
    }

    const rows = await this.db
      .select()
      .from(cityProducts)
      .innerJoin(products, eq(cityProducts.productId, products.id))
      .where(and(...conditions));

    let results = rows.map((r) => ({ ...r.products, cityProduct: r.city_products }));

    // In-memory filters for JSONB array fields
    if (filters.excludedIngredients?.length) {
      results = results.filter(
        (p) =>
          !filters.excludedIngredients!.some(
            (ing) =>
              (p.ingredients as string[] | null)
                ?.map((i) => i.toLowerCase())
                .includes(ing.toLowerCase()) ||
              (p.allergens as string[] | null)
                ?.map((a) => a.toLowerCase())
                .includes(ing.toLowerCase()),
          ),
      );
    }

    if (filters.preferredIngredients?.length) {
      results = results.filter((p) =>
        filters.preferredIngredients!.some((ing) =>
          (p.ingredients as string[] | null)
            ?.map((i) => i.toLowerCase())
            .includes(ing.toLowerCase()),
        ),
      );
    }

    if (filters.spicy === false) {
      results = results.filter(
        (p) =>
          !(p.tags as string[] | null)
            ?.map((t) => t.toLowerCase())
            .some((t) => ['острый', 'острое', 'spicy', 'spice', 'острый вкус'].includes(t)),
      );
    }

    if (filters.tags?.length) {
      results = results.filter((p) =>
        filters.tags!.some((tag) =>
          (p.tags as string[] | null)?.map((t) => t.toLowerCase()).includes(tag.toLowerCase()),
        ),
      );
    }

    return results;
  }

  async findById(
    productId: string,
    rn: string,
    br: string,
    target: string,
  ): Promise<ProductWithCityData | null> {
    const rows = await this.db
      .select()
      .from(cityProducts)
      .innerJoin(products, eq(cityProducts.productId, products.id))
      .where(
        and(
          eq(products.id, productId),
          eq(cityProducts.rn, rn),
          eq(cityProducts.br, br),
          eq(cityProducts.target, target),
        ),
      )
      .limit(1);

    if (!rows.length) return null;
    return { ...rows[0].products, cityProduct: rows[0].city_products };
  }
}
