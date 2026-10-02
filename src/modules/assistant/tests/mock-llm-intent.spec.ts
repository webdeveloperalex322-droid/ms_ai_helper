import { describe, it, expect } from 'vitest';
import { MockLLMProvider } from '../providers/mock-llm.provider';

const provider = new MockLLMProvider();

async function intentOf(message: string): Promise<string> {
  return (await provider.parseIntent({ message })).intent;
}

describe('MockLLMProvider.parseIntent — service questions', () => {
  it.each([
    'сколько стоит доставка',
    'как оплатить заказ',
    'можно оплатить картой при получении?',
    'какой кешбэк начисляется',
    'сколько бонусов дают за заказ',
    'какие акции сейчас',
    'есть ли промокод на первый заказ',
    'адрес ресторана на Республики',
    'до скольки работаете',
    'есть ли самовывоз',
    'кто вы такие, расскажите о компании',
    'как связаться с поддержкой',
  ])('"%s" → info_question', async (message) => {
    expect(await intentOf(message)).toBe('info_question');
  });

  it.each([
    'где мой заказ 123',
    'статус заказа',
    'покажи историю заказов',
    'зайти в личный кабинет',
  ])('"%s" stays unsupported', async (message) => {
    expect(await intentOf(message)).toBe('unsupported');
  });

  it.each([
    ['подбери сет на двоих до 1500', 'product_recommendation'],
    ['что входит в Филадельфию', 'product_question'],
    ['сколько калорий в Калифорнии', 'nutrition_question'],
    ['покажи только роллы с лососем', 'product_filter'],
  ])('"%s" keeps the product intent %s', async (message, expected) => {
    expect(await intentOf(message)).toBe(expected);
  });
});

describe('MockLLMProvider.answerFromKnowledge', () => {
  const passages = [
    {
      id: 'c1',
      title: 'Доставка и оплата',
      heading: 'Как оплатить заказ?',
      url: 'https://tyumen.sushi-master.ru/delivery',
      text: 'Доставка и оплата › Как оплатить заказ?\n### Наличными\nОплата наличными курьеру или в ресторане при получении заказа.',
    },
    {
      id: 'c2',
      title: 'Бонусы',
      url: 'https://tyumen.sushi-master.ru/bonus',
      text: 'Бонусы\nКешбэк до 10%.',
    },
  ];

  it('quotes the first passage body and points to its page', async () => {
    const result = await provider.answerFromKnowledge({ question: 'как оплатить', passages });
    expect(result.not_found).toBe(false);
    expect(result.used_passage_ids).toEqual(['c1']);
    expect(result.answer_text).toContain('Оплата наличными курьеру');
    expect(result.answer_text).not.toContain('Доставка и оплата › Как оплатить заказ?');
    expect(result.answer_text).toContain('Подробнее на странице: Доставка и оплата');
    expect(result.quick_replies?.length).toBeGreaterThan(0);
  });

  it('cuts long bodies to about 300 characters', async () => {
    const long = { ...passages[0], text: `Заголовок\n${'слово '.repeat(200)}` };
    const result = await provider.answerFromKnowledge({ question: 'q', passages: [long] });
    const [excerpt] = result.answer_text.split('\n\n');
    expect(excerpt.length).toBeLessThanOrEqual(302);
    expect(excerpt.endsWith('…')).toBe(true);
  });

  it('reports not_found without passages', async () => {
    const result = await provider.answerFromKnowledge({ question: 'q', passages: [] });
    expect(result.not_found).toBe(true);
    expect(result.used_passage_ids).toEqual([]);
    expect(result.answer_text).toBeTruthy();
  });
});
