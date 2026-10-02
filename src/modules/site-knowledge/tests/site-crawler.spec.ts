import { describe, it, expect, vi } from 'vitest';
import { SiteCrawlerService } from '../crawler/site-crawler.service';
import { HtmlTextExtractor } from '../crawler/html-text-extractor';
import type { FetchedPage, PageFetcher } from '../crawler/page-fetcher.interface';
import { MIN_CONTENT_CHARS } from '../snapshot';

const SITE = 'https://tyumen.sushi-master.ru';
const RN = 'rn-1';
const BR = 'br-1';

function pageHtml(title: string, body: string): string {
  return `<html><head><title>${title} | Суши Мастер</title></head><body><header>H</header><main>${body}<footer>F</footer></main></body></html>`;
}

const longText = 'Текст страницы достаточно длинный. '.repeat(10);

function fakeFetcher(
  pages: Record<string, string | Error>,
  opts: { delayMs?: number; onActive?: (n: number) => void } = {},
): PageFetcher & { calls: string[] } {
  let active = 0;
  const calls: string[] = [];
  return {
    calls,
    async fetch(url: string): Promise<FetchedPage> {
      calls.push(url);
      active++;
      opts.onActive?.(active);
      try {
        if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
        const path = new URL(url).pathname;
        const entry = pages[path];
        if (entry === undefined) throw new Error(`404 ${path}`);
        if (entry instanceof Error) throw entry;
        return { html: entry, title: 'ignored', finalUrl: url };
      } finally {
        active--;
      }
    },
    async close() {},
  };
}

function crawler(fetcher: PageFetcher) {
  return new SiteCrawlerService(fetcher, new HtmlTextExtractor());
}

describe('SiteCrawlerService.crawl', () => {
  it('builds a snapshot with one entry per requested path', async () => {
    const fetcher = fakeFetcher({
      '/about': pageHtml('О компании', `<h1>О компании</h1><p>${longText}</p>`),
      '/delivery': pageHtml('Доставка', `<h1>Доставка</h1><p>${longText}</p>`),
    });

    const snapshot = await crawler(fetcher).crawl({
      siteUrl: SITE,
      rn: RN,
      br: BR,
      citySlug: 'tyumen',
      pages: ['/about', '/delivery'],
      promotionDetails: false,
    });

    expect(snapshot.version).toBe(1);
    expect(snapshot.site_url).toBe(SITE);
    expect(snapshot.rn).toBe(RN);
    expect(snapshot.br).toBe(BR);
    expect(snapshot.city_slug).toBe('tyumen');
    expect(snapshot.pages.map((p) => p.path)).toEqual(['/about', '/delivery']);

    const about = snapshot.pages[0];
    expect(about.key).toBe('about');
    expect(about.url).toBe(`${SITE}/about`);
    expect(about.title).toBe('О компании');
    expect(about.status).toBe('ok');
    expect(about.content.startsWith('# О компании')).toBe(true);
    expect(about.content_hash).toMatch(/^[0-9a-f]{32}$/);
    expect(Date.parse(about.fetched_at)).not.toBeNaN();
    expect(Date.parse(snapshot.crawled_at)).not.toBeNaN();
  });

  it('marks a page whose fetch throws as failed and keeps crawling', async () => {
    const fetcher = fakeFetcher({
      '/about': new Error('net::ERR_TIMED_OUT'),
      '/delivery': pageHtml('Доставка', `<h1>Доставка</h1><p>${longText}</p>`),
    });

    const snapshot = await crawler(fetcher).crawl({
      siteUrl: SITE,
      rn: RN,
      br: BR,
      pages: ['/about', '/delivery'],
      promotionDetails: false,
    });

    expect(snapshot.pages[0]).toMatchObject({
      path: '/about',
      status: 'failed',
      error: 'net::ERR_TIMED_OUT',
      content: '',
    });
    expect(snapshot.pages[1].status).toBe('ok');
  });

  it('marks a page with too little text as failed with "empty content"', async () => {
    const fetcher = fakeFetcher({
      '/bonus': pageHtml('Бонусы', '<h1>Бонусы</h1><p>мало</p>'),
    });

    const snapshot = await crawler(fetcher).crawl({
      siteUrl: SITE,
      rn: RN,
      br: BR,
      pages: ['/bonus'],
      promotionDetails: false,
    });

    expect(snapshot.pages[0].status).toBe('failed');
    expect(snapshot.pages[0].error).toMatch(/empty content/);
    expect(snapshot.pages[0].content.length).toBeLessThan(MIN_CONTENT_CHARS);
  });

  it('follows promotion detail links from /promotions once, without duplicates', async () => {
    const list = pageHtml(
      'Акции',
      `<h1>Акции</h1><a href="/promotions/a">A</a><a href="/promotions/a">A</a><a href="/promotions/b">B</a><a href="/menu/x">menu</a><p>${longText}</p>`,
    );
    const fetcher = fakeFetcher({
      '/promotions': list,
      '/promotions/a': pageHtml('Акция A', `<h1>Акция A</h1><p>${longText}</p>`),
      '/promotions/b': pageHtml(
        'Акция B',
        `<h1>Акция B</h1><a href="/promotions/c">c</a><p>${longText}</p>`,
      ),
    });

    const snapshot = await crawler(fetcher).crawl({
      siteUrl: SITE,
      rn: RN,
      br: BR,
      pages: ['/promotions'],
      promotionDetails: true,
    });

    expect(snapshot.pages.map((p) => p.path)).toEqual([
      '/promotions',
      '/promotions/a',
      '/promotions/b',
    ]);
    expect(snapshot.pages[1].key).toBe('promotions/a');
    // depth 1 only: /promotions/c linked from a detail page is not followed
    expect(fetcher.calls.filter((u) => u.endsWith('/promotions/c'))).toHaveLength(0);
  });

  it('caps the number of promotion detail pages', async () => {
    const links = Array.from({ length: 5 }, (_, i) => `<a href="/promotions/p${i}">p${i}</a>`).join(
      '',
    );
    const pages: Record<string, string> = {
      '/promotions': pageHtml('Акции', `<h1>Акции</h1>${links}<p>${longText}</p>`),
    };
    for (let i = 0; i < 5; i++) {
      pages[`/promotions/p${i}`] = pageHtml(`P${i}`, `<h1>P${i}</h1><p>${longText}</p>`);
    }
    const fetcher = fakeFetcher(pages);

    const snapshot = await crawler(fetcher).crawl({
      siteUrl: SITE,
      rn: RN,
      br: BR,
      pages: ['/promotions'],
      promotionDetails: true,
      maxPromotionDetails: 2,
    });

    expect(snapshot.pages).toHaveLength(3);
  });

  it('does not follow promotion links when promotionDetails is false', async () => {
    const fetcher = fakeFetcher({
      '/promotions': pageHtml(
        'Акции',
        `<h1>Акции</h1><a href="/promotions/a">A</a><p>${longText}</p>`,
      ),
    });

    const snapshot = await crawler(fetcher).crawl({
      siteUrl: SITE,
      rn: RN,
      br: BR,
      pages: ['/promotions'],
      promotionDetails: false,
    });

    expect(snapshot.pages).toHaveLength(1);
    expect(fetcher.calls).toHaveLength(1);
  });

  it('never runs more fetches at once than concurrency allows', async () => {
    let peak = 0;
    const pages: Record<string, string> = {};
    for (let i = 0; i < 6; i++) {
      pages[`/p${i}`] = pageHtml(`P${i}`, `<h1>P${i}</h1><p>${longText}</p>`);
    }
    const fetcher = fakeFetcher(pages, {
      delayMs: 5,
      onActive: (n) => {
        peak = Math.max(peak, n);
      },
    });

    await crawler(fetcher).crawl({
      siteUrl: SITE,
      rn: RN,
      br: BR,
      pages: Object.keys(pages),
      promotionDetails: false,
      concurrency: 2,
    });

    expect(peak).toBe(2);
    expect(fetcher.calls).toHaveLength(6);
  });

  it('normalizes paths, removes duplicates and reports progress', async () => {
    const fetcher = fakeFetcher({
      '/about': pageHtml('О компании', `<h1>О компании</h1><p>${longText}</p>`),
    });
    const onPage = vi.fn();

    const snapshot = await crawler(fetcher).crawl({
      siteUrl: `${SITE}/`,
      rn: RN,
      br: BR,
      pages: ['about', '/about/', '/about'],
      promotionDetails: false,
      onPage,
    });

    expect(snapshot.site_url).toBe(SITE);
    expect(snapshot.pages).toHaveLength(1);
    expect(fetcher.calls).toEqual([`${SITE}/about`]);
    expect(onPage).toHaveBeenCalledTimes(1);
    expect(onPage.mock.calls[0][0]).toMatchObject({ path: '/about', status: 'ok' });
  });

  it('uses the default page list when none is given', async () => {
    const fetcher = fakeFetcher({});
    const snapshot = await crawler(fetcher).crawl({
      siteUrl: SITE,
      rn: RN,
      br: BR,
      promotionDetails: false,
    });
    expect(snapshot.pages).toHaveLength(10);
    expect(snapshot.pages.every((p) => p.status === 'failed')).toBe(true);
  });

  it('closes the fetcher when done', async () => {
    const fetcher = fakeFetcher({});
    const close = vi.spyOn(fetcher, 'close');
    await crawler(fetcher).crawl({
      siteUrl: SITE,
      rn: RN,
      br: BR,
      pages: [],
      promotionDetails: false,
    });
    expect(close).toHaveBeenCalledTimes(1);
  });
});
