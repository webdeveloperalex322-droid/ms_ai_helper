import { Injectable } from '@nestjs/common';
import {
  LLMProvider,
  IntentParseInput,
  IntentResult,
  RerankerInput,
  LLMRerankerResult,
} from './llm.provider.interface';

@Injectable()
export class MockLLMProvider implements LLMProvider {
  async parseIntent(input: IntentParseInput): Promise<IntentResult> {
    const msg = input.message?.toLowerCase() ?? '';

    // Rule-based intent detection
    const intent = this.detectIntent(msg);
    const slots = this.extractSlots(msg);

    return {
      intent,
      slots,
      need_clarification: false,
      clarification_question: null,
      confidence: 0.85,
    };
  }

  async rerankAndAnswer(input: RerankerInput): Promise<LLMRerankerResult> {
    const maxCards = input.max_cards ?? 5;
    const selected = input.candidates.slice(0, maxCards).map((c) => ({
      product_id: c.product_id,
      reason: this.generateReason(c, input.constraints),
    }));

    const reply = this.generateReply(selected.length, input.constraints);

    return {
      selected,
      reply_text: reply,
      quick_replies: ['Показать дешевле', 'Только с лососем', 'Без острого'],
      need_clarification: false,
    };
  }

  private detectIntent(msg: string): string {
    if (this.containsAny(msg, ['заказ', 'статус', 'доставк', 'где мой'])) {
      return 'unsupported';
    }
    if (this.containsAny(msg, ['чем отличается', 'сравни', 'versus', 'vs'])) {
      return 'product_compare';
    }
    if (this.containsAny(msg, ['входит', 'состав', 'содержит', 'что в '])) {
      return 'product_question';
    }
    if (this.containsAny(msg, ['калори', 'кбжу', 'белк', 'жир', 'углевод'])) {
      return 'nutrition_question';
    }
    if (this.containsAny(msg, ['аллерг', 'непереносим', 'без ', 'нет '])) {
      return 'allergen_question';
    }
    if (this.containsAny(msg, ['покажи', 'только', 'фильтр'])) {
      return 'product_filter';
    }
    return 'product_recommendation';
  }

  private extractSlots(msg: string): IntentResult['slots'] {
    const slots: IntentResult['slots'] = {};

    // Budget
    const budgetMatch = msg.match(/до\s*(\d+)/i) ?? msg.match(/(\d+)\s*руб/i);
    if (budgetMatch) {
      slots.budget_max = parseInt(budgetMatch[1], 10);
    }

    // Excluded ingredients
    const excludedMatches = msg.match(/без\s+([а-яё]+(?:\s+[а-яё]+)?)/gi) ?? [];
    if (excludedMatches.length) {
      slots.excluded_ingredients = excludedMatches.map((m) => m.replace(/^без\s+/i, '').trim());
    }

    // Spicy
    if (msg.includes('острый') || msg.includes('острое') || msg.includes('пострее')) {
      slots.spicy = true;
    } else if (
      msg.includes('не острый') ||
      msg.includes('без острого') ||
      msg.includes('неострый')
    ) {
      slots.spicy = false;
    }

    // People count
    const peopleMatch = msg.match(/на\s*(\d+)\s*(чел|персон|двоих|троих)/i);
    if (peopleMatch) {
      slots.people_count = parseInt(peopleMatch[1], 10);
    } else if (msg.includes('двоих') || msg.includes('двоим')) {
      slots.people_count = 2;
    } else if (msg.includes('троих') || msg.includes('троим')) {
      slots.people_count = 3;
    }

    // Category
    if (msg.includes('сет') || msg.includes('набор')) {
      slots.category = 'set';
    } else if (msg.includes('ролл') || msg.includes('роллы')) {
      slots.category = 'roll';
    } else if (msg.includes('суши') || msg.includes('нигири')) {
      slots.category = 'sushi';
    } else if (msg.includes('напит')) {
      slots.category = 'drink';
    } else if (msg.includes('десерт')) {
      slots.category = 'dessert';
    }

    // Preferred ingredients
    const preferred: string[] = [];
    if (msg.includes('лосось') || msg.includes('с лососем')) preferred.push('лосось');
    if (msg.includes('авокадо')) preferred.push('авокадо');
    if (msg.includes('краб')) preferred.push('краб');
    if (msg.includes('тунец')) preferred.push('тунец');
    if (msg.includes('креветк')) preferred.push('креветка');
    if (preferred.length) slots.preferred_ingredients = preferred;

    // Allergy risk
    if (msg.includes('аллерг')) {
      slots.allergy_risk = true;
    }

    return slots;
  }

  private containsAny(text: string, words: string[]): boolean {
    return words.some((w) => text.includes(w));
  }

  private generateReason(candidate: any, constraints: Record<string, any>): string {
    const parts: string[] = [];
    if (constraints.budget_max) parts.push(`до ${constraints.budget_max} ₽`);
    if (constraints.people_count) parts.push(`на ${constraints.people_count}`);
    if (constraints.excluded_ingredients?.length) {
      parts.push(`без ${constraints.excluded_ingredients.join(', ')}`);
    }
    return parts.join(', ') || 'соответствует запросу';
  }

  private generateReply(count: number, constraints: Record<string, any>): string {
    if (count === 0) {
      return 'К сожалению, не нашёл подходящих товаров по вашему запросу.';
    }
    const parts: string[] = [];
    if (constraints.budget_max) parts.push(`до ${constraints.budget_max} ₽`);
    if (constraints.category) parts.push(`из категории ${constraints.category}`);
    return `Подобрал ${count} вариант${count === 1 ? '' : count < 5 ? 'а' : 'ов'}${parts.length ? ' ' + parts.join(', ') : ''} из актуального меню.`;
  }
}
