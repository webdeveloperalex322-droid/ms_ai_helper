import { describe, it, expect, vi } from 'vitest';
import {
  SiteKnowledgeSearchService,
  buildTsQuery,
  type KnowledgeHit,
} from '../services/site-knowledge-search.service';

function hit(chunkId: string, score: number, extra: Partial<KnowledgeHit> = {}): KnowledgeHit {
  return {
    chunkId,
    pageId: `page-${chunkId}`,
    url: `https://x/${chunkId}`,
    title: `Title ${chunkId}`,
    heading: null,
    text: `text ${chunkId}`,
    score,
    ...extra,
  };
}

class TestSearch extends SiteKnowledgeSearchService {
  constructor(
    private readonly semantic: KnowledgeHit[] | Error,
    private readonly keyword: KnowledgeHit[] | Error,
    public readonly embedQuery = vi.fn(async () => [0.1, 0.2, 0.3]),
  ) {
    super({} as any, { embedQuery } as any);
  }

  protected async vectorSearch(): Promise<KnowledgeHit[]> {
    if (this.semantic instanceof Error) throw this.semantic;
    return this.semantic;
  }

  protected async keywordSearch(): Promise<KnowledgeHit[]> {
    if (this.keyword instanceof Error) throw this.keyword;
    return this.keyword;
  }
}

const input = { query: 'как оплатить заказ', rn: 'rn', br: 'br' };

describe('SiteKnowledgeSearchService.search', () => {
  it('merges both branches by chunk id with 0.7/0.3 weights and normalized keyword rank', async () => {
    const service = new TestSearch([hit('a', 0.95), hit('b', 0.5)], [hit('b', 0.4), hit('c', 0.2)]);

    const result = await service.search(input);

    // a: 0.7*0.95 = 0.665 beats b: 0.7*0.5 + 0.3*1 = 0.65 beats c: 0.3*0.5 = 0.15
    expect(result.map((p) => p.chunkId)).toEqual(['a', 'b', 'c']);
    const [a, b, c] = result;
    expect(a.score).toBeCloseTo(0.7 * 0.95);
    expect(b.semanticScore).toBe(0.5);
    expect(b.keywordScore).toBeCloseTo(1); // 0.4 / max(0.4)
    expect(b.score).toBeCloseTo(0.7 * 0.5 + 0.3 * 1);
    expect(c.keywordScore).toBeCloseTo(0.5);
    expect(c.score).toBeCloseTo(0.3 * 0.5);
    expect(c.url).toBe('https://x/c');
  });

  it('embeds the query exactly once', async () => {
    const service = new TestSearch([hit('a', 0.9)], []);
    await service.search(input);
    expect(service.embedQuery).toHaveBeenCalledTimes(1);
    expect(service.embedQuery).toHaveBeenCalledWith('как оплатить заказ');
  });

  it('limits the result to topK', async () => {
    const semantic = Array.from({ length: 10 }, (_, i) => hit(`s${i}`, 1 - i / 10));
    const service = new TestSearch(semantic, []);
    const result = await service.search({ ...input, topK: 3 });
    expect(result).toHaveLength(3);
    expect(result[0].chunkId).toBe('s0');
  });

  it('caps passages per page so one long document cannot fill the whole result', async () => {
    const legal = Array.from({ length: 9 }, (_, i) =>
      hit(`l${i}`, 0.9 - i / 100, { pageId: 'oferta' }),
    );
    const delivery = hit('d1', 0.5, { pageId: 'delivery' });
    const service = new TestSearch([...legal, delivery], []);

    const result = await service.search({ ...input, topK: 7 });

    expect(result.map((p) => p.chunkId)).toEqual(['l0', 'l1', 'l2', 'l3', 'l4', 'l5', 'd1']);
    expect(result.filter((p) => p.pageId === 'oferta')).toHaveLength(6);
  });

  it('defaults topK to 10', async () => {
    const semantic = Array.from({ length: 14 }, (_, i) => hit(`s${i}`, 1 - i / 14));
    const service = new TestSearch(semantic, []);
    expect(await service.search(input)).toHaveLength(10);
  });

  it('falls back to the other branch when one throws', async () => {
    const onlyKeyword = new TestSearch(new Error('pgvector down'), [hit('k', 0.3)]);
    const fromKeyword = await onlyKeyword.search(input);
    expect(fromKeyword.map((p) => p.chunkId)).toEqual(['k']);
    expect(fromKeyword[0].score).toBeCloseTo(0.3);

    const onlySemantic = new TestSearch([hit('v', 0.8)], new Error('tsquery syntax'));
    const fromSemantic = await onlySemantic.search(input);
    expect(fromSemantic.map((p) => p.chunkId)).toEqual(['v']);
  });

  it('returns [] when both branches are empty or the query is blank', async () => {
    expect(await new TestSearch([], []).search(input)).toEqual([]);
    const service = new TestSearch([hit('a', 1)], []);
    expect(await service.search({ ...input, query: '   ' })).toEqual([]);
    expect(service.embedQuery).not.toHaveBeenCalled();
  });
});

describe('buildTsQuery', () => {
  it('builds a prefix OR query from content words, dropping punctuation, stop words and duplicates', () => {
    expect(buildTsQuery('Как оплатить заказ?')).toBe('оплатить:* | заказ:*');
    expect(buildTsQuery('какие акции сейчас действуют')).toBe('акции:* | действуют:*');
    expect(buildTsQuery('в Тюмени, до 23:00! Тюмени')).toBe('тюмени:*');
    expect(buildTsQuery('а как что')).toBe('');
  });
});
