import { Injectable, Inject } from '@nestjs/common';
import { LLM_PROVIDER_TOKEN, LLMProvider, IntentResult } from '../providers/llm.provider.interface';

@Injectable()
export class IntentSlotParserService {
  constructor(@Inject(LLM_PROVIDER_TOKEN) private readonly llmProvider: LLMProvider) {}

  async parse(
    message: string,
    context: { screenContext?: string; target?: string },
  ): Promise<IntentResult> {
    return this.llmProvider.parseIntent({
      message,
      screenContext: context.screenContext,
      target: context.target,
      knownCategories: ['roll', 'set', 'drink', 'sauce', 'dessert', 'hot'],
      knownIngredients: [
        'лосось',
        'краб',
        'тунец',
        'авокадо',
        'огурец',
        'сливочный сыр',
        'креветка',
      ],
    });
  }

  parseFromPayload(payload: { intent: string; slots: Record<string, any> }): IntentResult {
    return {
      intent: payload.intent,
      slots: payload.slots,
      need_clarification: false,
      clarification_question: null,
      confidence: 1.0,
    };
  }
}
