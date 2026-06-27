import { Injectable, Inject } from '@nestjs/common';
import { DATABASE_TOKEN, DrizzleDB } from '../../../database/database.module';
import { products, cityProducts } from '../../../database/schema';
import { eq, and, ilike } from 'drizzle-orm';
import { ProductWithCityData } from './catalog.service';

@Injectable()
export class ProductLookupService {
  constructor(@Inject(DATABASE_TOKEN) private readonly db: DrizzleDB) {}

  async findByName(
    name: string,
    rn: string,
    br: string,
    target: string,
  ): Promise<ProductWithCityData[]> {
    // Fuzzy: exact match first, then partial
    const rows = await this.db
      .select()
      .from(products)
      .innerJoin(cityProducts, eq(cityProducts.productId, products.id))
      .where(
        and(
          ilike(products.name, `%${name}%`),
          eq(cityProducts.rn, rn),
          eq(cityProducts.br, br),
          eq(cityProducts.target, target),
          eq(cityProducts.isAvailable, true),
        ),
      );

    return rows.map((r) => ({ ...r.products, cityProduct: r.city_products }));
  }
}
