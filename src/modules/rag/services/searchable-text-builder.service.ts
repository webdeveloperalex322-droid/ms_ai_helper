import { Injectable, Inject } from '@nestjs/common';
import { DATABASE_TOKEN, DrizzleDB } from '../../../database/database.module';
import { productChunks, NewProductChunk } from '../../../database/schema';
import { ProductWithCityData } from '../../catalog/services/catalog.service';
import { createHash } from 'crypto';
import { randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';

@Injectable()
export class SearchableTextBuilderService {
  constructor(@Inject(DATABASE_TOKEN) private readonly db: DrizzleDB) {}

  buildSearchableText(product: ProductWithCityData): string {
    const parts: string[] = [];

    parts.push(`Название: ${product.name}`);

    if (product.categoryName) {
      parts.push(`Категория: ${product.categoryName}`);
    }

    if (product.description) {
      parts.push(`Описание: ${product.description}`);
    }

    const ingredients = product.ingredients as string[] | null;
    if (ingredients?.length) {
      parts.push(`Состав: ${ingredients.join(', ')}`);
    }

    const allergens = product.allergens as string[] | null;
    if (allergens?.length) {
      parts.push(`Аллергены: ${allergens.join(', ')}`);
    }

    const tags = product.tags as string[] | null;
    if (tags?.length) {
      parts.push(`Теги: ${tags.join(', ')}`);
    }

    if (product.weight) {
      parts.push(`Вес: ${product.weight} г`);
    }

    if (product.pieces) {
      parts.push(`Кусочки: ${product.pieces}`);
    }

    const caloriesParts: string[] = [];
    if (product.calories) caloriesParts.push(`${product.calories} ккал`);
    if (product.protein) caloriesParts.push(`белки ${product.protein}`);
    if (product.fat) caloriesParts.push(`жиры ${product.fat}`);
    if (product.carbs) caloriesParts.push(`углеводы ${product.carbs}`);
    if (caloriesParts.length) {
      parts.push(`КБЖУ: ${caloriesParts.join(', ')}`);
    }

    if (product.cityProduct.price) {
      parts.push(`Цена: ${product.cityProduct.price} RUB`);
    }

    parts.push(`Доступность: ${product.cityProduct.isAvailable ? 'доступен' : 'недоступен'}`);

    return parts.join('\n');
  }

  buildMetadata(product: ProductWithCityData): Record<string, any> {
    return {
      rn: product.rn,
      br: product.cityProduct.br,
      target: product.cityProduct.target,
      product_id: product.id,
      name: product.name,
      category_id: product.categoryId,
      category_name: product.categoryName,
      price: product.cityProduct.price ? parseFloat(String(product.cityProduct.price)) : null,
      is_available: product.cityProduct.isAvailable,
      ingredients: product.ingredients ?? [],
      allergens: product.allergens ?? [],
      tags: product.tags ?? [],
    };
  }

  async upsertChunk(product: ProductWithCityData): Promise<string> {
    const searchableText = this.buildSearchableText(product);
    const metadata = this.buildMetadata(product);
    const contentHash = createHash('md5').update(searchableText).digest('hex');

    const existing = await this.db
      .select({ id: productChunks.id, contentHash: productChunks.contentHash })
      .from(productChunks)
      .where(
        and(
          eq(productChunks.productId, product.id),
          eq(productChunks.br, product.cityProduct.br),
          eq(productChunks.target, product.cityProduct.target),
        ),
      )
      .limit(1);

    if (existing.length && existing[0].contentHash === contentHash) {
      return existing[0].id;
    }

    const chunkData: NewProductChunk = {
      id: (existing[0]?.id ?? randomUUID()) as string,
      productId: product.id,
      rn: product.rn,
      br: product.cityProduct.br,
      target: product.cityProduct.target,
      chunkType: 'main',
      searchableText,
      metadata,
      contentHash,
      embeddingStatus: 'pending',
      updatedAt: new Date(),
    };

    await this.db
      .insert(productChunks)
      .values(chunkData)
      .onConflictDoUpdate({
        target: [productChunks.id],
        set: {
          searchableText: chunkData.searchableText,
          metadata: chunkData.metadata,
          contentHash: chunkData.contentHash,
          embeddingStatus: 'pending',
          updatedAt: new Date(),
        },
      });

    return chunkData.id!;
  }
}
