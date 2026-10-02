import { Injectable } from '@nestjs/common';
import { LLMRerankerResult, IntentResult } from '../providers/llm.provider.interface';
import { CatalogService } from '../../catalog/services/catalog.service';

export interface ValidationContext {
  rn: string;
  br: string;
  target: string;
  slots: IntentResult['slots'];
  shortlistIds: string[];
  bannedPhrases?: string[];
  maxCards?: number;
}

export interface ValidationResult {
  valid: boolean;
  sanitized: LLMRerankerResult;
  errors: ValidationError[];
}

export interface ValidationError {
  code: string;
  product_id?: string;
  detail?: string;
}

const ALLERGY_SAFETY_PATTERNS = [
  '100% безопасно',
  'абсолютно безопасно',
  'полностью безопасно',
  'гарантированно безопасно',
  'не содержит аллергенов',
];

const MAX_FREE_TEXT_CHARS = 1200;

const BANNED_TOPICS = [
  'история заказ',
  'статус заказ',
  'где мой заказ',
  'оплат',
  'доставк',
  'мой адрес',
  'бонусн',
  'промокод',
];

@Injectable()
export class ResponseValidatorService {
  constructor(private readonly catalogService: CatalogService) {}

  async validate(
    response: LLMRerankerResult,
    context: ValidationContext,
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const validCards: typeof response.selected = [];

    const maxCards = context.maxCards ?? 5;

    for (const selected of response.selected) {
      const cardErrors = await this.validateCard(selected, context);
      if (cardErrors.length === 0) {
        validCards.push(selected);
      } else {
        errors.push(...cardErrors);
      }
    }

    // Rule 12: max cards
    const truncatedCards = validCards.slice(0, maxCards);

    // Rule 8-11: text validation
    const textErrors = this.validateText(response.reply_text ?? '', context);
    errors.push(...textErrors);

    const sanitizedReplyText = this.sanitizeText(response.reply_text ?? '', context);

    return {
      valid: errors.length === 0 && truncatedCards.length === response.selected.length,
      sanitized: {
        ...response,
        selected: truncatedCards,
        reply_text: sanitizedReplyText,
      },
      errors,
    };
  }

  private async validateCard(
    card: { product_id: string; reason: string },
    context: ValidationContext,
  ): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    // Rule 5: must be in shortlist
    if (!context.shortlistIds.includes(card.product_id)) {
      errors.push({ code: 'NOT_IN_SHORTLIST', product_id: card.product_id });
      return errors; // no need to check further
    }

    // Rule 1-4: product exists, available, price/name match
    const product = await this.catalogService.findById(
      card.product_id,
      context.rn,
      context.br,
      context.target,
    );

    if (!product) {
      errors.push({ code: 'PRODUCT_NOT_FOUND', product_id: card.product_id });
      return errors;
    }

    if (!product.cityProduct.isAvailable) {
      errors.push({ code: 'PRODUCT_UNAVAILABLE', product_id: card.product_id });
    }

    if (!product.cityProduct.isValid) {
      errors.push({ code: 'PRODUCT_INVALID', product_id: card.product_id });
    }

    // Rule 6: budget constraint
    if (context.slots.budget_max != null && product.cityProduct.price != null) {
      const price = parseFloat(String(product.cityProduct.price));
      if (price > context.slots.budget_max) {
        errors.push({
          code: 'BUDGET_EXCEEDED',
          product_id: card.product_id,
          detail: `${price} > ${context.slots.budget_max}`,
        });
      }
    }

    // Rule 7: excluded ingredients
    if (context.slots.excluded_ingredients?.length) {
      const ingredients = (product.ingredients as string[] | null) ?? [];
      const allergens = (product.allergens as string[] | null) ?? [];
      const allComposition = [...ingredients, ...allergens].map((s) => s.toLowerCase());

      for (const excluded of context.slots.excluded_ingredients) {
        if (allComposition.includes(excluded.toLowerCase())) {
          errors.push({
            code: 'EXCLUDED_INGREDIENT',
            product_id: card.product_id,
            detail: excluded,
          });
        }
      }
    }

    // Rule 8 (slot-level): spicy constraint
    if (context.slots.spicy === false) {
      const tags = (product.tags as string[] | null) ?? [];
      if (tags.some((t) => ['острый', 'острое', 'spicy'].includes(t.toLowerCase()))) {
        errors.push({ code: 'SPICY_CONSTRAINT_VIOLATED', product_id: card.product_id });
      }
    }

    return errors;
  }

  private validateText(text: string, context: ValidationContext): ValidationError[] {
    const errors: ValidationError[] = [];

    // Allergy safety phrases
    for (const pattern of ALLERGY_SAFETY_PATTERNS) {
      if (text.toLowerCase().includes(pattern.toLowerCase())) {
        errors.push({ code: 'ALLERGY_SAFETY_CLAIM', detail: pattern });
      }
    }

    // Banned topics
    for (const topic of BANNED_TOPICS) {
      if (text.toLowerCase().includes(topic.toLowerCase())) {
        errors.push({ code: 'BANNED_TOPIC', detail: topic });
      }
    }

    // Custom banned phrases
    for (const phrase of context.bannedPhrases ?? []) {
      if (text.toLowerCase().includes(phrase.toLowerCase())) {
        errors.push({ code: 'BANNED_PHRASE', detail: phrase });
      }
    }

    return errors;
  }

  private sanitizeText(text: string, _context: ValidationContext): string {
    let sanitized = text;

    for (const pattern of ALLERGY_SAFETY_PATTERNS) {
      sanitized = sanitized.replace(new RegExp(pattern, 'gi'), 'уточните состав у ресторана');
    }

    return sanitized;
  }

  /**
   * Sanitizer for free-text answers that are not about products (service
   * questions answered from the site knowledge base). Only the medical-safety
   * patterns apply: BANNED_TOPICS lists delivery/payment/bonuses on purpose for
   * product answers, and those are exactly the topics a service answer covers.
   */
  sanitizeFreeText(text: string): string {
    let sanitized = (text ?? '').trim();

    for (const pattern of ALLERGY_SAFETY_PATTERNS) {
      sanitized = sanitized.replace(new RegExp(pattern, 'gi'), 'уточните состав у ресторана');
    }

    if (sanitized.length > MAX_FREE_TEXT_CHARS) {
      const cut = sanitized.slice(0, MAX_FREE_TEXT_CHARS);
      const sentenceEnd = Math.max(
        cut.lastIndexOf('. '),
        cut.lastIndexOf('! '),
        cut.lastIndexOf('? '),
      );
      sanitized = (
        sentenceEnd > MAX_FREE_TEXT_CHARS / 2 ? cut.slice(0, sentenceEnd + 1) : cut
      ).trimEnd();
      if (!/[.!?…]$/.test(sanitized)) sanitized += '…';
    }

    return sanitized;
  }
}
