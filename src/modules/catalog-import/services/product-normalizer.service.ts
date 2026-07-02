import { Injectable } from '@nestjs/common';
import { ProductApiResponse } from '../clients/catalog-api.client.interface';
import { NewProduct, NewCityProduct } from '../../../database/schema';

export interface NormalizedProduct {
  product: Omit<NewProduct, 'id' | 'createdAt' | 'updatedAt'>;
  cityProduct: Omit<NewCityProduct, 'id' | 'productId' | 'importedAt'>;
  isValid: boolean;
  invalidReason?: string;
}

@Injectable()
export class ProductNormalizerService {
  normalize(raw: ProductApiResponse, rn: string, br: string, target: string): NormalizedProduct {
    const price = this.normalizePrice(raw.price);
    const isValid = this.validateProduct(raw, price);

    return {
      product: {
        rn,
        // Shared product identity is the plain GUID (`productId`); `id` carries a
        // target suffix (e.g. "<guid>-WEB") that would break the uuid column.
        externalProductId: raw.productId ?? raw.id,
        name: raw.name?.trim() ?? '',
        categoryId: raw.categoryId ?? null,
        categoryName: raw.categoryName ?? null,
        description: raw.description ?? null,
        ingredients: Array.isArray(raw.ingredients) ? raw.ingredients : null,
        allergens: Array.isArray(raw.allergens) ? raw.allergens : null,
        tags: Array.isArray(raw.tags) ? raw.tags : null,
        weight: raw.weight != null ? String(raw.weight) : null,
        pieces: raw.pieces ?? null,
        calories: raw.calories != null ? String(raw.calories) : null,
        protein: raw.protein != null ? String(raw.protein) : null,
        fat: raw.fat != null ? String(raw.fat) : null,
        carbs: raw.carbs != null ? String(raw.carbs) : null,
        imageUrl: raw.imageUrl ?? null,
        rawPayload: raw,
      },
      cityProduct: {
        rn,
        br,
        target,
        price: price != null ? String(price) : null,
        oldPrice: raw.oldPrice != null ? String(raw.oldPrice) : null,
        currency: 'RUB',
        isAvailable: raw.isAvailable !== false,
        isValid,
        invalidReason: isValid ? null : this.getInvalidReason(raw, price),
        rawPayload: raw,
      },
      isValid,
    };
  }

  private normalizePrice(price: any): number | null {
    if (price == null) return null;
    const num = Number(price);
    if (isNaN(num) || num < 0) return null;
    return num;
  }

  private validateProduct(raw: ProductApiResponse, price: number | null): boolean {
    if (!raw.name?.trim()) return false;
    if (price === null || price <= 0) return false;
    return true;
  }

  private getInvalidReason(raw: ProductApiResponse, price: number | null): string {
    if (!raw.name?.trim()) return 'missing_name';
    if (price === null) return 'missing_price';
    if (price <= 0) return 'invalid_price';
    return 'unknown';
  }
}
