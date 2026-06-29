import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { OpenAILLMProvider } from '../../../modules/assistant/providers/openai-llm.provider';
import { LlmClient } from '../llm-client.interface';

describe('OpenAILLMProvider', () => {
  let provider: OpenAILLMProvider;
  let llmClient: LlmClient;

  beforeEach(() => {
    llmClient = {
      chatCompletion: vi.fn(),
      chatCompletionStream: vi.fn(),
      createEmbeddings: vi.fn(),
      getBalance: vi.fn(),
    };

    const config = {
      get: vi.fn((key: string) => {
        if (key === 'LLM_MAX_TOKENS') return 1500;
        if (key === 'MAX_CARDS_IN_RESPONSE') return 5;
        return undefined;
      }),
    } as unknown as ConfigService;

    provider = new OpenAILLMProvider(llmClient, config);
  });

  it('parseIntent delegates to LlmClient and parses JSON', async () => {
    vi.mocked(llmClient.chatCompletion).mockResolvedValue({
      content: JSON.stringify({
        intent: 'product_filter',
        slots: { category: 'roll' },
        need_clarification: false,
        confidence: 0.8,
      }),
      model: 'gpt-4o-mini',
    });

    const result = await provider.parseIntent({ message: 'покажи роллы' });

    expect(llmClient.chatCompletion).toHaveBeenCalledOnce();
    expect(result.intent).toBe('product_filter');
    expect(result.slots.category).toBe('roll');
  });

  it('rerankAndAnswer filters invalid product ids', async () => {
    vi.mocked(llmClient.chatCompletion).mockResolvedValue({
      content: JSON.stringify({
        selected: [
          { product_id: 'p1', reason: 'подходит' },
          { product_id: 'fake', reason: 'не из списка' },
        ],
        reply_text: 'Готово',
      }),
      model: 'gpt-4o-mini',
    });

    const result = await provider.rerankAndAnswer({
      user_request: 'сет до 1500',
      constraints: { budget_max: 1500 },
      candidates: [{ product_id: 'p1', name: 'Сет', price: 1200, currency: 'RUB' }],
      max_cards: 3,
    });

    expect(result.selected).toEqual([{ product_id: 'p1', reason: 'подходит' }]);
    expect(result.reply_text).toBe('Готово');
  });
});
