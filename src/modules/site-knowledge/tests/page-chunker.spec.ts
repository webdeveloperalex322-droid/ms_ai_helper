import { describe, it, expect } from 'vitest';
import { chunkPage } from '../services/page-chunker';

const TITLE = 'Условия доставки в Тюмени';

function para(n: number, filler = 'слово'): string {
  return Array.from({ length: n }, () => filler).join(' ');
}

describe('chunkPage', () => {
  it('returns no chunks for empty content', () => {
    expect(chunkPage({ title: TITLE, content: '' })).toEqual([]);
    expect(chunkPage({ title: TITLE, content: '   \n\n ' })).toEqual([]);
  });

  it('splits by headings of levels 1-3 and prefixes each chunk with the page title and heading path', () => {
    const content = [
      `# ${TITLE}`,
      '## Как оплатить заказ?',
      '### Наличными',
      'Оплата наличными курьеру или в ресторане при получении заказа. Принимаем рубли.',
      '### Банковской картой онлайн',
      'При оформлении заказа на сайте, сервис доступен для карт Visa и MasterCard.',
      '## Как получить свой заказ?',
      'Заказывайте любым удобным способом, получайте заказ на указанный вами адрес.',
    ].join('\n');

    const chunks = chunkPage({ title: TITLE, content }, { minTail: 10 });

    expect(chunks.map((c) => c.heading)).toEqual([
      'Как оплатить заказ? › Наличными',
      'Как оплатить заказ? › Банковской картой онлайн',
      'Как получить свой заказ?',
    ]);
    expect(chunks[0].text.startsWith(`${TITLE} › Как оплатить заказ? › Наличными\n`)).toBe(true);
    expect(chunks[0].text).toContain('Оплата наличными курьеру');
    expect(chunks.map((c) => c.index)).toEqual([0, 1, 2]);
  });

  it('does not repeat the page title in the heading path when the h1 equals the title', () => {
    const content = `# ${TITLE}\nТекст без подзаголовков, достаточно длинный для отдельного фрагмента страницы.`;
    const [chunk] = chunkPage({ title: TITLE, content }, { minTail: 10 });
    expect(chunk.heading).toBeNull();
    expect(chunk.text.startsWith(`${TITLE}\nТекст без подзаголовков`)).toBe(true);
  });

  it('keeps an h1 that differs from the title in the heading path', () => {
    const content = '# Другой заголовок\nТело раздела, которое не совпадает с названием страницы.';
    const [chunk] = chunkPage({ title: TITLE, content }, { minTail: 10 });
    expect(chunk.heading).toBe('Другой заголовок');
  });

  it('treats level-4+ headings as body text', () => {
    const content = `## Раздел\n#### Подпункт\nТекст подпункта достаточно длинный для фрагмента.`;
    const [chunk] = chunkPage({ title: TITLE, content }, { minTail: 10 });
    expect(chunk.heading).toBe('Раздел');
    expect(chunk.text).toContain('Подпункт');
    expect(chunk.text).not.toContain('####');
  });

  it('splits a section longer than maxChars by paragraphs', () => {
    const p1 = para(30);
    const p2 = para(30);
    const p3 = para(30);
    const content = `## Длинный раздел\n${p1}\n\n${p2}\n\n${p3}`;

    const chunks = chunkPage({ title: TITLE, content }, { maxChars: p1.length + 20, minTail: 10 });

    expect(chunks.length).toBe(3);
    for (const chunk of chunks) {
      expect(chunk.heading).toBe('Длинный раздел');
      expect(chunk.text.length).toBeLessThanOrEqual(p1.length + 20 + TITLE.length + 40);
    }
  });

  it('hard-splits a single paragraph that is longer than maxChars', () => {
    const content = `## Оферта\n${para(200, 'пункт')}`;
    const chunks = chunkPage({ title: TITLE, content }, { maxChars: 300, minTail: 10 });
    expect(chunks.length).toBeGreaterThan(1);
    const bodies = chunks.map((c) => c.text.split('\n').slice(1).join('\n'));
    for (const body of bodies) {
      expect(body.length).toBeLessThanOrEqual(300);
    }
  });

  it('merges a short tail into the previous chunk', () => {
    const content = [
      '## Первый',
      'Достаточно длинный текст первого раздела, чтобы он стал самостоятельным фрагментом.',
      '## Хвост',
      'Коротко.',
    ].join('\n');

    const chunks = chunkPage({ title: TITLE, content }, { minTail: 80 });

    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toContain('Коротко.');
    expect(chunks[0].text).toContain('Хвост');
  });

  it('chunks a long document without headings by paragraphs', () => {
    const paragraphs = Array.from({ length: 6 }, (_, i) => `${i + 1}. ${para(25)}`);
    const content = paragraphs.join('\n\n');
    const chunks = chunkPage({ title: 'Оферта', content }, { maxChars: 400, minTail: 10 });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.heading === null)).toBe(true);
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i));
  });

  it('keeps a heading without body as text when it has no children (landing-page slogans)', () => {
    const content = [
      '## Следующие заказы',
      'Делайте заказы регулярно и копите баллы, отслеживая пополнения в личном кабинете.',
      '## Главное не забывать о нас месяца на три: через 90 дней бонусы обнуляются!',
      '## Вы можете оплачивать своими бонусами до 30% заказа!',
      '## FAQ',
      '### На что не действует бонусная система?',
      'На одноразовые и регулярные тематические акции, на стоимость доставки и на товары со скидкой.',
    ].join('\n');

    const chunks = chunkPage({ title: 'Бонусы', content }, { minTail: 10 });
    const all = chunks.map((c) => c.text).join('\n');

    expect(all).toContain('через 90 дней бонусы обнуляются!');
    expect(all).toContain('оплачивать своими бонусами до 30% заказа!');
    // "FAQ" is a parent of the h3 and is not emitted as body text on its own line
    expect(chunks.some((c) => c.text.split('\n').slice(1).join('\n').trim() === 'FAQ')).toBe(false);
    expect(chunks.at(-1)?.heading).toBe('FAQ › На что не действует бонусная система?');
  });

  it('keeps a trailing heading without body', () => {
    const content =
      '## Раздел\nТекст раздела достаточно длинный, чтобы быть фрагментом.\n## Это не просто заказ, а счастье в каждой коробочке!';
    const chunks = chunkPage({ title: 'О компании', content }, { minTail: 10 });
    expect(chunks.map((c) => c.text).join('\n')).toContain('счастье в каждой коробочке!');
  });

  it('drops a heading-only section but keeps it in the path of its children', () => {
    const content = [
      '## Условия доставки',
      '### Укажите полный адрес доставки или выберите на карте для определения времени ожидания заказа',
      'Доставка по городу от 30 минут, точное время зависит от зоны и загруженности ресторана.',
    ].join('\n');
    const chunks = chunkPage({ title: TITLE, content }, { minTail: 10 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].heading?.startsWith('Условия доставки › Укажите полный адрес')).toBe(true);
  });
});
