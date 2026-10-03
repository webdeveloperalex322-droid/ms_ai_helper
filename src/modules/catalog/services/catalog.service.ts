import { Injectable, Inject } from '@nestjs/common';
import { DATABASE_TOKEN, DrizzleDB } from '../../../database/database.module';
import { products, cityProducts, cities, Product, CityProduct } from '../../../database/schema';
import { eq, and, lte, inArray, or, sql, SQL } from 'drizzle-orm';

export interface CatalogFilters {
  budgetMax?: number;
  /** Resolved product.category_id values; empty or omitted means no category filter. */
  categoryIds?: string[];
  /**
   * Resolved category display names, matched case-insensitively against
   * product.category_name. The live catalog stores a SUBcategory id on the product, so the
   * name is the only link back to the directory entry.
   */
  categoryNames?: string[];
  preferredIngredients?: string[];
  excludedIngredients?: string[];
  spicy?: boolean;
  /**
   * Upper calorie bound, in the unit the catalogue provider reports. Products
   * without a calorie value are kept: a missing figure is not a heavy dish.
   */
  caloriesMax?: number;
  tags?: string[];
  attributeNames?: string[];
  isAvailable?: boolean;
}

export interface ProductWithCityData extends Product {
  cityProduct: CityProduct;
}

/**
 * Whether any of `needles` occurs in the product's ingredients (and, for an
 * exclusion, its allergens). Comparison is case-insensitive and by substring,
 * so a stem like `креветк` covers both "Креветка" and "Креветки в панировке".
 */
function matchesAny(
  product: { ingredients: unknown; allergens: unknown },
  needles: string[],
  includeAllergens: boolean,
): boolean {
  const haystack = [
    ...((product.ingredients as string[] | null) ?? []),
    ...(includeAllergens ? ((product.allergens as string[] | null) ?? []) : []),
  ]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.toLowerCase());

  if (!haystack.length) return false;

  return needles.some((needle) => {
    const value = needle.trim().toLowerCase();
    return value.length > 0 && haystack.some((entry) => entry.includes(value));
  });
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
      eq(cities.isActive, true),
      eq(products.isActive, true),
    ];

    if (filters.isAvailable !== false) {
      conditions.push(eq(cityProducts.isAvailable, true));
    }

    if (filters.budgetMax != null) {
      conditions.push(lte(cityProducts.price, String(filters.budgetMax)));
    }

    if (filters.caloriesMax != null) {
      conditions.push(
        or(sql`${products.calories} is null`, lte(products.calories, String(filters.caloriesMax)))!,
      );
    }

    // A product belongs to the requested category if it carries one of the resolved ids OR
    // one of the resolved names — different catalogs fill one or the other.
    const categoryMatches: SQL[] = [];
    if (filters.categoryIds?.length) {
      categoryMatches.push(inArray(products.categoryId, filters.categoryIds));
    }
    if (filters.categoryNames?.length) {
      categoryMatches.push(
        inArray(
          sql`lower(${products.categoryName})`,
          filters.categoryNames.map((name) => name.toLowerCase()),
        ),
      );
    }

    if (categoryMatches.length === 1) {
      conditions.push(categoryMatches[0]);
    } else if (categoryMatches.length > 1) {
      conditions.push(or(...categoryMatches) as SQL);
    }

    const rows = await this.db
      .select()
      .from(cityProducts)
      .innerJoin(products, eq(cityProducts.productId, products.id))
      .innerJoin(cities, and(eq(cities.br, cityProducts.br), eq(cities.rn, cityProducts.rn)))
      .where(and(...conditions));

    let results = rows.map((r) => ({ ...r.products, cityProduct: r.city_products }));

    // In-memory filters for JSONB array fields.
    //
    // Matching is by SUBSTRING, not equality: the live catalog writes free text
    // there ("Креветки в панировке", "краб-микс соус", "икра масаго"), so an
    // exact compare let a shrimp roll through a "no fish" filter and found
    // nothing for a "crab" preference (spec 012, checked on Tyumen 2026-10-02).
    if (filters.excludedIngredients?.length) {
      results = results.filter((p) => !matchesAny(p, filters.excludedIngredients!, true));
    }

    if (filters.preferredIngredients?.length) {
      results = results.filter((p) => matchesAny(p, filters.preferredIngredients!, false));
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
