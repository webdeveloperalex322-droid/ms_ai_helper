import { Injectable } from '@nestjs/common';
import { ProductApiResponse, ProductLocalization } from '../clients/catalog-api.client.interface';
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
    const nutritional = raw.additionalProperties?.nutritional;

    return {
      product: {
        rn,
        // Shared product identity is the plain GUID (`productId`); `id` carries a
        // target suffix (e.g. "<guid>-WEB") that would break the uuid column.
        externalProductId: raw.productId ?? raw.id,
        name: this.resolveName(raw),
        categoryId: raw.categoryId ?? null,
        categoryName: this.resolveCategoryName(raw),
        description: this.resolveDescription(raw),
        ingredients: this.parseIngredients(nutritional?.composition?.value),
        allergens: null,
        tags: null,
        weight: nutritional?.weight != null ? String(nutritional.weight) : null,
        pieces: raw.additionalProperties?.pieces ?? null,
        calories: nutritional?.calorie != null ? String(nutritional.calorie) : null,
        protein: nutritional?.proteins != null ? String(nutritional.proteins) : null,
        fat: nutritional?.fat != null ? String(nutritional.fat) : null,
        carbs: nutritional?.carbohydrates != null ? String(nutritional.carbohydrates) : null,
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

  /** Pick the Russian localization entry, falling back to the first entry. */
  private pickRu<T extends { language: string }>(arr?: T[]): T | undefined {
    if (!arr || arr.length === 0) return undefined;
    return arr.find((x) => x.language === 'ru') ?? arr[0];
  }

  /** Prefer the localized (ru) product name; fall back to the top-level name. */
  private resolveName(raw: ProductApiResponse): string {
    const localized = this.pickRu<ProductLocalization>(raw.localization)?.name;
    return (localized ?? raw.name ?? '').trim();
  }

  /** Prefer a non-empty top-level productDescription; else the localized one. Null when both empty. */
  private resolveDescription(raw: ProductApiResponse): string | null {
    const top = raw.productDescription?.trim();
    if (top) return top;
    const localized = this.pickRu<ProductLocalization>(
      raw.localization,
    )?.productDescription?.trim();
    return localized && localized.length > 0 ? localized : null;
  }

  /**
   * Resolve categoryName from the classifier matching `mainCategotyId`, else the first
   * classifier. Reads the localized (ru) name, falling back to the classifier's `name`.
   * Null only when the classifiers array is empty/absent.
   */
  private resolveCategoryName(raw: ProductApiResponse): string | null {
    const classifiers = raw.classifiers;
    if (!classifiers || classifiers.length === 0) return null;
    const match = classifiers.find((c) => c.categoryId === raw.mainCategotyId) ?? classifiers[0];
    const name =
      this.pickRu<{ language: string; name?: string }>(match.localization)?.name ?? match.name;
    const trimmed = (name ?? '').trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  /** Split the comma-separated composition string into a trimmed ingredient array. */
  private parseIngredients(value?: string): string[] | null {
    if (!value) return null;
    const items = value
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return items.length > 0 ? items : null;
  }

  private normalizePrice(price: any): number | null {
    if (price == null) return null;
    const num = Number(price);
    if (isNaN(num) || num < 0) return null;
    return num;
  }

  private validateProduct(raw: ProductApiResponse, price: number | null): boolean {
    if (!this.resolveName(raw)) return false;
    if (price === null || price <= 0) return false;
    return true;
  }

  private getInvalidReason(raw: ProductApiResponse, price: number | null): string {
    if (!this.resolveName(raw)) return 'missing_name';
    if (price === null) return 'missing_price';
    if (price <= 0) return 'invalid_price';
    return 'unknown';
  }
}
