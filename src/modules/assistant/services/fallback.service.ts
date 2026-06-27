import { Injectable } from '@nestjs/common';
import { ProductCandidate } from '../providers/llm.provider.interface';
import { IntentResult } from '../providers/llm.provider.interface';

export interface FallbackResponse {
  reply_text: string;
  cards: any[];
  quick_replies: string[];
  actions: any[];
  need_clarification: boolean;
  clarification_question?: string | null;
  fallback_used: true;
}

@Injectable()
export class FallbackService {
  forUnsupportedIntent(): FallbackResponse {
    return {
      reply_text:
        'Я пока помогаю только с вопросами по товарам из нашего меню. Спросите меня о роллах, сетах или ингредиентах!',
      cards: [],
      quick_replies: ['Популярные роллы', 'Подобрать сет', 'Что с лососем?'],
      actions: [],
      need_clarification: false,
      fallback_used: true,
    };
  }

  forEmptyResult(slots: IntentResult['slots']): FallbackResponse {
    const parts: string[] = [];
    if (slots.budget_max) parts.push(`до ${slots.budget_max} ₽`);
    if (slots.category) parts.push(`из категории ${slots.category}`);
    if (slots.excluded_ingredients?.length) {
      parts.push(`без ${slots.excluded_ingredients.join(', ')}`);
    }

    const filters = parts.length ? ` (${parts.join(', ')})` : '';

    return {
      reply_text: `Не нашёл подходящих товаров${filters} в вашем городе. Попробуйте изменить запрос или снять ограничения.`,
      cards: [],
      quick_replies: ['Показать популярное', 'Показать новинки', 'Подобрать другой вариант'],
      actions: [],
      need_clarification: true,
      clarification_question: 'Хотите, чтобы я предложил что-то другое?',
      fallback_used: true,
    };
  }

  forLLMTimeout(topCandidates: ProductCandidate[]): FallbackResponse {
    const cards = topCandidates.slice(0, 5).map((c) => ({
      product_id: c.product_id,
      name: c.name,
      price: c.price,
      currency: c.currency,
      image_url: c.image_url,
      reason: 'соответствует запросу',
      ui_action: 'show_product_card',
    }));

    return {
      reply_text: 'Показываю популярные варианты по вашему запросу:',
      cards,
      quick_replies: ['Показать ещё', 'Уточнить запрос'],
      actions: cards.length
        ? [{ type: 'show_products', product_ids: cards.map((c) => c.product_id) }]
        : [],
      need_clarification: false,
      fallback_used: true,
    };
  }

  forInvalidResponse(): FallbackResponse {
    return {
      reply_text: 'Не смог сформировать ответ. Попробуйте переформулировать запрос.',
      cards: [],
      quick_replies: ['Показать популярное', 'Начать сначала'],
      actions: [],
      need_clarification: false,
      fallback_used: true,
    };
  }

  forSuggestionEmpty(
    fallbackPayload: { reply_text: string; quick_replies: string[] } | null,
  ): FallbackResponse {
    if (fallbackPayload) {
      return {
        reply_text: fallbackPayload.reply_text,
        cards: [],
        quick_replies: fallbackPayload.quick_replies,
        actions: [],
        need_clarification: false,
        fallback_used: true,
      };
    }

    return {
      reply_text:
        'Сейчас не нашёл подходящих товаров в вашем городе. Могу предложить похожие варианты из доступного меню.',
      cards: [],
      quick_replies: ['Показать популярное', 'Показать новинки', 'Подобрать другой вариант'],
      actions: [],
      need_clarification: false,
      fallback_used: true,
    };
  }
}
