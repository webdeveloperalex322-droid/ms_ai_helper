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

/** A site page the answer can point to. */
export interface InfoSource {
  url: string;
  title: string;
}

/** The best knowledge fragment found for a service question. */
export interface InfoPassageSummary extends InfoSource {
  text: string;
}

export const INFO_QUICK_REPLIES = ['Условия доставки', 'Бонусная программа', 'Адреса ресторанов'];
const INFO_EXCERPT_CHARS = 400;

export function openUrlAction(source: InfoSource) {
  return { type: 'open_url', url: source.url, title: source.title };
}

@Injectable()
export class FallbackService {
  /**
   * The model did not answer in time (or failed) for a service question:
   * quote the most relevant fragment of the site and link to its page.
   */
  forInfoTimeout(best: InfoPassageSummary): FallbackResponse {
    // The passage text starts with its "title › heading" line; show the body.
    const body = best.text.split('\n').slice(1).join('\n').trim() || best.text.trim();
    const excerpt =
      body.length > INFO_EXCERPT_CHARS ? `${body.slice(0, INFO_EXCERPT_CHARS).trimEnd()}…` : body;

    return {
      reply_text: `${excerpt}\n\nПодробнее: ${best.title}`,
      cards: [],
      quick_replies: INFO_QUICK_REPLIES,
      actions: [openUrlAction(best)],
      need_clarification: false,
      fallback_used: true,
    };
  }

  /** The site has no answer to the question; point to the closest page if there is one. */
  forInfoNotFound(source?: InfoSource): FallbackResponse {
    return {
      reply_text:
        'На сайте нет такой информации. Уточните вопрос или обратитесь в поддержку ресторана.' +
        (source ? ` Ближайшая по теме страница: ${source.title}.` : ''),
      cards: [],
      quick_replies: INFO_QUICK_REPLIES,
      actions: source ? [openUrlAction(source)] : [],
      need_clarification: false,
      fallback_used: true,
    };
  }

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

  forEmptyResult(slots: IntentResult['slots'], categoryLabel?: string): FallbackResponse {
    const parts: string[] = [];
    if (slots.budget_max) parts.push(`до ${slots.budget_max} ₽`);
    // Prefer the catalog's display name over the raw slot value (`roll`, `set`).
    const category = categoryLabel ?? slots.category;
    if (category) parts.push(`из категории ${category}`);
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
