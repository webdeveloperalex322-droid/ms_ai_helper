import { describe, it, expect, vi } from 'vitest';
import { AssistantOrchestratorService } from '@/modules/assistant/services/assistant-orchestrator.service';
import { FallbackService } from '@/modules/assistant/services/fallback.service';
import type { InfoAnswerResult } from '@/modules/assistant/services/info-answer.service';
import { cities, products, assistantSuggestions } from '@/database/schema';

const RN = 'A79C5050-1EE7-11EB-9B6E-05B5FC40DF2A';
const BR = 'E3AFD1AC-4D3D-EA11-A958-8B023DE8EF69';

/**
 * Drizzle stand-in for the orchestrator's pre-flight queries and the ai_logs
 * insert: select().from(table)…  resolves per table, insert().values() records.
 */
function makeDb(opts: { cityActive?: boolean; productsTotal?: number; suggestion?: any } = {}) {
  const logs: any[] = [];
  const rowsFor = async (table: unknown) => {
    if (table === cities) return [{ isActive: opts.cityActive ?? true }];
    if (table === products) return [{ total: opts.productsTotal ?? 5 }];
    if (table === assistantSuggestions) return opts.suggestion ? [opts.suggestion] : [];
    return [];
  };
  const chain = (table: unknown): any => {
    const c: any = {
      innerJoin: () => c,
      where: () => c,
      limit: () => rowsFor(table),
      then: (resolve: any, reject: any) => rowsFor(table).then(resolve, reject),
    };
    return c;
  };
  const db = {
    select: () => ({ from: (table: unknown) => chain(table) }),
    insert: () => ({
      values: async (row: any) => {
        logs.push(row);
      },
    }),
  };
  return { db, logs };
}

const ANSWER: InfoAnswerResult = {
  kind: 'answer',
  reply_text: 'Оплатить можно наличными, картой онлайн или картой при получении.',
  quick_replies: ['Условия доставки'],
  actions: [
    {
      type: 'open_url',
      url: 'https://tyumen.sushi-master.ru/delivery',
      title: 'Доставка и оплата',
    },
  ],
  source: { url: 'https://tyumen.sushi-master.ru/delivery', title: 'Доставка и оплата' },
  sources: ['https://tyumen.sushi-master.ru/delivery'],
};

function build(
  opts: { intent?: string; info?: InfoAnswerResult; db?: ReturnType<typeof makeDb> } = {},
) {
  const { db, logs } = opts.db ?? makeDb();
  const intentParser = {
    parse: vi.fn(async () => ({
      intent: opts.intent ?? 'info_question',
      slots: {},
      need_clarification: false,
      clarification_question: null,
      confidence: 0.9,
    })),
    parseFromPayload: vi.fn((payload: any) => ({
      intent: payload.intent,
      slots: payload.slots,
      need_clarification: false,
      clarification_question: null,
      confidence: 1,
    })),
  } as any;
  const shortlistBuilder = {
    buildWithContext: vi.fn(async () => ({ candidates: [], categoryLabel: undefined })),
  } as any;
  const llmProvider = { rerankAndAnswer: vi.fn() } as any;
  const validator = { validate: vi.fn() } as any;
  const config = { get: () => undefined } as any;
  const infoAnswer = { answer: vi.fn(async () => opts.info ?? ANSWER) } as any;

  const orchestrator = new AssistantOrchestratorService(
    db as any,
    llmProvider,
    intentParser,
    shortlistBuilder,
    validator,
    new FallbackService(),
    config,
    infoAnswer,
  );

  return { orchestrator, logs, intentParser, shortlistBuilder, infoAnswer };
}

const baseRequest = { rn: RN, br: BR, target: 'WEB', userMessage: 'как оплатить заказ' };

describe('AssistantOrchestratorService — info_question', () => {
  it('answers a service question from the knowledge base without building a shortlist', async () => {
    const { orchestrator, logs, shortlistBuilder, infoAnswer } = build();

    const response = await orchestrator.handle(baseRequest);

    expect(response.reply_text).toBe(ANSWER.reply_text);
    expect(response.cards).toEqual([]);
    expect(response.actions).toEqual(ANSWER.actions);
    expect(response.quick_replies).toEqual(['Условия доставки']);
    expect(response.need_clarification).toBe(false);
    expect(shortlistBuilder.buildWithContext).not.toHaveBeenCalled();
    expect(infoAnswer.answer).toHaveBeenCalledWith({
      question: 'как оплатить заказ',
      rn: RN,
      br: BR,
      target: 'WEB',
    });

    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      intent: 'info_question',
      validationStatus: 'info_answer',
      fallbackUsed: false,
      retrievedProductIds: [],
      selectedProductIds: [],
      llmResponse: {
        kind: 'info',
        sources: ['https://tyumen.sushi-master.ru/delivery'],
        not_found: false,
      },
    });
  });

  it('falls back to the unsupported-intent text when the knowledge base is empty', async () => {
    const { orchestrator, logs } = build({
      info: { kind: 'empty', reply_text: '', quick_replies: [], actions: [], sources: [] },
    });

    const response = await orchestrator.handle(baseRequest);

    expect(response.reply_text).toBe(new FallbackService().forUnsupportedIntent().reply_text);
    expect(response.cards).toEqual([]);
    expect(logs[0]).toMatchObject({ validationStatus: 'info_empty', fallbackUsed: true });
  });

  it('logs a timeout answer as a fallback', async () => {
    const { orchestrator, logs } = build({
      info: {
        ...ANSWER,
        kind: 'timeout',
        reply_text: 'Оплата наличными…\n\nПодробнее: Доставка и оплата',
      },
    });

    const response = await orchestrator.handle(baseRequest);

    expect(response.reply_text).toContain('Подробнее: Доставка и оплата');
    expect(logs[0]).toMatchObject({ validationStatus: 'info_timeout', fallbackUsed: true });
  });

  it('logs not_found with the flag set', async () => {
    const { orchestrator, logs } = build({ info: { ...ANSWER, kind: 'not_found' } });
    await orchestrator.handle(baseRequest);
    expect(logs[0]).toMatchObject({
      validationStatus: 'info_not_found',
      fallbackUsed: false,
      llmResponse: { kind: 'info', not_found: true },
    });
  });

  it('takes the question from a preset suggestion with an info intent', async () => {
    const suggestion = {
      id: 'sug-1',
      enabled: true,
      target: 'WEB',
      allowedBr: null,
      activeFrom: null,
      activeTo: null,
      payload: { intent: 'info_question', slots: {}, retrieval_query: 'условия доставки' },
      fallbackPayload: { reply_text: 'Подробности на сайте', quick_replies: [] },
    };
    const { orchestrator, infoAnswer } = build({ db: makeDb({ suggestion }) });

    const response = await orchestrator.handle({
      rn: RN,
      br: BR,
      target: 'WEB',
      suggestionId: 'sug-1',
    });

    expect(infoAnswer.answer).toHaveBeenCalledWith({
      question: 'условия доставки',
      rn: RN,
      br: BR,
      target: 'WEB',
    });
    expect(response.reply_text).toBe(ANSWER.reply_text);
  });

  it('returns the preset fallback payload when the knowledge base is empty', async () => {
    const suggestion = {
      id: 'sug-1',
      enabled: true,
      target: 'WEB',
      allowedBr: null,
      activeFrom: null,
      activeTo: null,
      payload: { intent: 'info_question', slots: {}, retrieval_query: 'условия доставки' },
      fallbackPayload: { reply_text: 'Подробности на сайте', quick_replies: ['Меню'] },
    };
    const { orchestrator } = build({
      db: makeDb({ suggestion }),
      info: { kind: 'empty', reply_text: '', quick_replies: [], actions: [], sources: [] },
    });

    const response = await orchestrator.handle({
      rn: RN,
      br: BR,
      target: 'WEB',
      suggestionId: 'sug-1',
    });
    expect(response.reply_text).toBe('Подробности на сайте');
    expect(response.quick_replies).toEqual(['Меню']);
  });

  it('keeps the product path for product intents (regression)', async () => {
    const { orchestrator, shortlistBuilder, infoAnswer } = build({
      intent: 'product_recommendation',
    });

    await orchestrator.handle({ ...baseRequest, userMessage: 'подбери сет на двоих' });

    expect(shortlistBuilder.buildWithContext).toHaveBeenCalledTimes(1);
    expect(infoAnswer.answer).not.toHaveBeenCalled();
  });

  it('keeps unsupported intents on the old refusal (regression)', async () => {
    const { orchestrator, infoAnswer } = build({ intent: 'unsupported' });
    const response = await orchestrator.handle({
      ...baseRequest,
      userMessage: 'где мой заказ 123',
    });
    expect(response.reply_text).toBe(new FallbackService().forUnsupportedIntent().reply_text);
    expect(infoAnswer.answer).not.toHaveBeenCalled();
  });
});
