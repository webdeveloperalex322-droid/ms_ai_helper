import { describe, it, expect } from 'vitest';
import { FallbackService } from '../services/fallback.service';

const service = new FallbackService();

const best = {
  url: 'https://tyumen.sushi-master.ru/delivery',
  title: 'Доставка и оплата',
  text: 'Доставка и оплата › Как оплатить заказ?\nОплата наличными курьеру или в ресторане при получении заказа.',
};

describe('FallbackService.forInfoTimeout', () => {
  it('quotes the passage body (without its heading line) and links to the page', () => {
    const result = service.forInfoTimeout(best);
    expect(result.reply_text.startsWith('Оплата наличными курьеру')).toBe(true);
    expect(result.reply_text).not.toContain('Доставка и оплата › Как оплатить заказ?');
    expect(result.reply_text).toContain('Подробнее: Доставка и оплата');
    expect(result.actions).toEqual([
      {
        type: 'open_url',
        url: 'https://tyumen.sushi-master.ru/delivery',
        title: 'Доставка и оплата',
      },
    ]);
    expect(result.cards).toEqual([]);
    expect(result.fallback_used).toBe(true);
    expect(result.quick_replies.length).toBeGreaterThan(0);
  });

  it('cuts the excerpt to about 400 characters', () => {
    const result = service.forInfoTimeout({ ...best, text: `Заголовок\n${'слово '.repeat(200)}` });
    const [excerpt] = result.reply_text.split('\n\n');
    expect(excerpt.length).toBeLessThanOrEqual(401);
    expect(excerpt.endsWith('…')).toBe(true);
  });
});

describe('FallbackService.forInfoNotFound', () => {
  it('explains that the site has no such information and links the closest page', () => {
    const result = service.forInfoNotFound({ url: best.url, title: best.title });
    expect(result.reply_text).toContain('На сайте нет такой информации');
    expect(result.reply_text).toContain('Доставка и оплата');
    expect(result.actions[0]).toMatchObject({ type: 'open_url', url: best.url });
    expect(result.cards).toEqual([]);
  });

  it('works without a source', () => {
    const result = service.forInfoNotFound();
    expect(result.reply_text).toContain('На сайте нет такой информации');
    expect(result.actions).toEqual([]);
    expect(result.fallback_used).toBe(true);
  });
});
