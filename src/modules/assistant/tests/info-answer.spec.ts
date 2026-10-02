import { describe, it, expect, vi } from 'vitest';
import { InfoAnswerService } from '../services/info-answer.service';
import { FallbackService } from '../services/fallback.service';
import { ResponseValidatorService } from '../services/response-validator.service';
import type { KnowledgePassage } from '../../site-knowledge/services/site-knowledge-search.service';
import type { KnowledgeAnswerResult } from '../providers/llm.provider.interface';

function passage(
  chunkId: string,
  url: string,
  title: string,
  text: string,
  score: number,
): KnowledgePassage {
  return {
    chunkId,
    pageId: `p-${chunkId}`,
    url,
    title,
    heading: null,
    text,
    score,
    semanticScore: score,
    keywordScore: 0,
  };
}

const DELIVERY = passage(
  'c1',
  'https://x/delivery',
  'Доставка и оплата',
  'Доставка и оплата › Оплата\nОплата наличными курьеру или картой онлайн.',
  0.9,
);
const BONUS = passage('c2', 'https://x/bonus', 'Бонусы', 'Бонусы\nКешбэк до 10%.', 0.6);

const request = { question: 'как оплатить заказ', rn: 'rn', br: 'br', target: 'WEB' };

function build(opts: {
  passages?: KnowledgePassage[] | Error;
  llm?: (() => Promise<KnowledgeAnswerResult>) | 'hang';
  timeoutMs?: number;
}) {
  const search = {
    search: vi.fn(async () => {
      if (opts.passages instanceof Error) throw opts.passages;
      return opts.passages ?? [DELIVERY, BONUS];
    }),
  } as any;

  const answerFromKnowledge = vi.fn(
    opts.llm === 'hang'
      ? () => new Promise<KnowledgeAnswerResult>(() => undefined)
      : (opts.llm ??
          (async () => ({
            answer_text: 'Оплатить можно наличными или картой онлайн.',
            used_passage_ids: ['c1'],
            not_found: false,
            quick_replies: ['Условия доставки'],
          }))),
  );
  const llm = { answerFromKnowledge } as any;
  const validator = new ResponseValidatorService({} as any);
  const sanitize = vi.spyOn(validator, 'sanitizeFreeText');
  const config = {
    get: (key: string) => (key === 'LLM_TIMEOUT_MS' ? (opts.timeoutMs ?? 50) : undefined),
  } as any;

  const service = new InfoAnswerService(search, llm, validator, new FallbackService(), config);
  return { service, search, answerFromKnowledge, sanitize };
}

describe('InfoAnswerService.answer', () => {
  it('returns kind=empty without calling the model when the search finds nothing', async () => {
    const { service, answerFromKnowledge } = build({ passages: [] });
    const result = await service.answer(request);
    expect(result.kind).toBe('empty');
    expect(result.sources).toEqual([]);
    expect(answerFromKnowledge).not.toHaveBeenCalled();
  });

  it('treats a failing search like an empty one', async () => {
    const { service } = build({ passages: new Error('db down') });
    expect((await service.answer(request)).kind).toBe('empty');
  });

  it('returns the grounded answer with the source of the first used passage', async () => {
    const { service, answerFromKnowledge, sanitize } = build({});

    const result = await service.answer(request);

    expect(result.kind).toBe('answer');
    expect(result.reply_text).toBe('Оплатить можно наличными или картой онлайн.');
    expect(result.source).toEqual({ url: 'https://x/delivery', title: 'Доставка и оплата' });
    expect(result.sources).toEqual(['https://x/delivery']);
    expect(result.actions).toEqual([
      { type: 'open_url', url: 'https://x/delivery', title: 'Доставка и оплата' },
    ]);
    expect(result.quick_replies).toEqual(['Условия доставки']);
    expect(sanitize).toHaveBeenCalledWith('Оплатить можно наличными или картой онлайн.');

    const input = (answerFromKnowledge.mock.calls as any[])[0][0];
    expect(input.question).toBe('как оплатить заказ');
    expect(input.passages.map((p: any) => p.id)).toEqual(['c1', 'c2']);
    expect(input.passages[0]).toMatchObject({
      title: 'Доставка и оплата',
      url: 'https://x/delivery',
    });
  });

  it('deduplicates sources and ignores unknown passage ids', async () => {
    const { service } = build({
      llm: async () => ({
        answer_text: 'Ответ',
        used_passage_ids: ['c2', 'c1', 'c2', 'zzz'],
        not_found: false,
      }),
    });
    const result = await service.answer(request);
    expect(result.source?.url).toBe('https://x/bonus');
    expect(result.sources).toEqual(['https://x/bonus', 'https://x/delivery']);
    expect(result.quick_replies.length).toBeGreaterThan(0); // defaults
  });

  it('falls back to the best passage when the model used none', async () => {
    const { service } = build({
      llm: async () => ({ answer_text: 'Ответ', used_passage_ids: [], not_found: false }),
    });
    const result = await service.answer(request);
    expect(result.source?.url).toBe('https://x/delivery');
    expect(result.sources).toEqual(['https://x/delivery']);
  });

  it('returns kind=not_found with the model text and a link to the best page', async () => {
    const { service } = build({
      llm: async () => ({
        answer_text: 'На сайте нет такой информации.',
        used_passage_ids: [],
        not_found: true,
      }),
    });
    const result = await service.answer(request);
    expect(result.kind).toBe('not_found');
    expect(result.reply_text).toBe('На сайте нет такой информации.');
    expect(result.actions[0]).toMatchObject({ type: 'open_url', url: 'https://x/delivery' });
  });

  it('uses the not-found fallback text when the model left answer_text blank', async () => {
    const { service } = build({
      llm: async () => ({ answer_text: '', used_passage_ids: [], not_found: true }),
    });
    const result = await service.answer(request);
    expect(result.kind).toBe('not_found');
    expect(result.reply_text).toContain('На сайте нет такой информации');
  });

  it('returns kind=timeout quoting the best passage when the model is too slow', async () => {
    const { service } = build({ llm: 'hang', timeoutMs: 20 });
    const result = await service.answer(request);
    expect(result.kind).toBe('timeout');
    expect(result.reply_text.startsWith('Оплата наличными курьеру')).toBe(true);
    expect(result.reply_text).toContain('Подробнее: Доставка и оплата');
    expect(result.source?.url).toBe('https://x/delivery');
    expect(result.actions[0]).toMatchObject({ type: 'open_url' });
  });

  it('returns kind=timeout when the model throws', async () => {
    const { service } = build({
      llm: async () => {
        throw new Error('boom');
      },
    });
    expect((await service.answer(request)).kind).toBe('timeout');
  });

  it('sanitizes medical-safety claims in the answer', async () => {
    const { service } = build({
      llm: async () => ({
        answer_text: 'Это 100% безопасно.',
        used_passage_ids: ['c1'],
        not_found: false,
      }),
    });
    const result = await service.answer(request);
    expect(result.reply_text).toBe('Это уточните состав у ресторана.');
  });
});
