import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { HtmlTextExtractor } from '../crawler/html-text-extractor';

const fixture = (name: string) =>
  readFileSync(join(__dirname, 'fixtures', `${name}.html`), 'utf-8');

const extractor = new HtmlTextExtractor();

describe('HtmlTextExtractor.extract', () => {
  it('returns the page title without the brand suffix', () => {
    const { title } = extractor.extract(fixture('delivery'));
    expect(title).toBe('Стоимость доставки суши и роллов, условия доставки в Тюмени');
  });

  it('turns headings into markdown and keeps paragraphs (delivery page)', () => {
    const { content } = extractor.extract(fixture('delivery'));
    const lines = content.split('\n');

    expect(lines[0]).toBe('# Стоимость доставки суши и роллов, условия доставки в Тюмени');
    expect(content).toContain('## Как оплатить заказ?');
    expect(content).toContain('### Наличными');
    expect(content).toContain('Оплата наличными курьеру или в ресторане при получении заказа.');
    expect(content).toContain('### Банковской картой при получении');
    expect(content).toContain('Принимаются банковские карты MasterCard, Visa, МИР.');
    expect(content).toContain('## Как получить свой заказ?');
    expect(content).toContain('### Доставка к определенному времени');
  });

  it('drops header, footer, navigation, breadcrumbs and cookie notice', () => {
    const { content } = extractor.extract(fixture('delivery'));
    expect(content).not.toContain('Скачать приложение');
    expect(content).not.toContain('Все права защищены');
    expect(content).not.toContain('Главная');
    expect(content).not.toContain('Сеть ресторанов доставки блюд японской');
    expect(content).not.toContain('cookie');
    expect(content).not.toContain('Введите адрес доставки');
  });

  it('never emits empty bullets or empty lines', () => {
    const { content } = extractor.extract(fixture('restaurants'));
    for (const line of content.split('\n')) {
      expect(line.trim()).not.toBe('');
      expect(line.trim()).not.toBe('-');
    }
  });

  it('keeps restaurant names, addresses and hours (restaurants page)', () => {
    const { content } = extractor.extract(fixture('restaurants'));
    expect(content).toContain('# Суши Мастер в Тюмени');
    expect(content).toContain('## СМ-Тюмень-06');
    expect(content).toContain('625013 Россия, г Тюмень, улица Республики 204 корп 7 помещение 4');
    expect(content).toContain('Принимаем заказы на самовывоз');
    expect(content).toContain('c 10:30 до 23:00');
    expect(content).toContain('## СМ-Тюмень-03');
    expect(content).not.toContain('На карте');
    expect(content).not.toContain('Список');
  });

  it('promotes card titles to headings (promotions page)', () => {
    const { content } = extractor.extract(fixture('promotions'));
    expect(content).toContain('# Акции');
    expect(content).toContain('### Розыгрыш в честь Дня рождения Суши Мастер! 🥳');
    expect(content).toContain('Участвуй и выигрывай iPhone 18 Pro или 1 из 40 других призов ;)');
    expect(content).toContain('### Забери заказ сам и получи скидку 20%!');
    expect(content).toContain('Дарим скидку на самовывоз по промокоду: ЯСАМ');
  });

  it('keeps landing-page copy and FAQ (bonus page)', () => {
    const { content } = extractor.extract(fixture('bonus'));
    expect(content).toContain('### На что не действует бонусная система?');
    expect(content).toContain('С подарками, призами, сертификатами, скидками и промокодами');
    expect(content).toContain('до 1000 ₽ – 1%');
    expect(content).toContain('через 90 дней бонусы обнуляются');
    expect(content).not.toContain('Перейти в меню');
  });

  it('joins <br>-separated text into one paragraph', () => {
    const { content } = extractor.extract(fixture('bonus'));
    expect(content).toContain(
      'Мы постарались максимально упростить систему начисления бонусов за покупки, чтобы стало еще выгоднее и понятнее. Надеемся, вам понравится!',
    );
  });

  it('collapses duplicated consecutive lines', () => {
    const html = '<html><body><main><h2>Один</h2><p>Текст</p><p>Текст</p></main></body></html>';
    const { content } = extractor.extract(html);
    expect(content).toBe('## Один\nТекст');
  });

  it('returns almost nothing for a server-rendered shell without client content', () => {
    const { content, title } = extractor.extract(fixture('empty-shell'));
    expect(title).toBe('Стоимость доставки суши и роллов, условия доставки в Тюмени');
    expect(content.length).toBeLessThan(200);
  });

  it('falls back to body when there is no <main>', () => {
    const html =
      '<html><head><title>T</title></head><body><header>H</header><div><h1>Заголовок</h1><ul><li>раз</li><li>два</li></ul></div></body></html>';
    const { content } = extractor.extract(html);
    expect(content).toBe('# Заголовок\n- раз\n- два');
  });
});

describe('HtmlTextExtractor.extractLinks', () => {
  it('collects unique same-site links under a prefix as paths', () => {
    const html =
      '<a href="/promotions/a">A</a><a href="/promotions/a?x=1">A again</a>' +
      '<a href="https://tyumen.sushi-master.ru/promotions/b/">B</a>' +
      '<a href="/promotions">list</a><a href="/menu/x">menu</a>' +
      '<a href="https://other.site/promotions/c">other</a>';
    const links = extractor.extractLinks(html, '/promotions', 'https://tyumen.sushi-master.ru');
    expect(links).toEqual(['/promotions/a', '/promotions/b']);
  });

  it('finds the promotion detail links on the real promotions page', () => {
    const links = extractor.extractLinks(
      fixture('promotions'),
      '/promotions',
      'https://tyumen.sushi-master.ru',
    );
    expect(links).toContain('/promotions/rozygrysh-v-chest-dr');
    expect(links.length).toBeGreaterThan(5);
    expect(new Set(links).size).toBe(links.length);
  });
});
