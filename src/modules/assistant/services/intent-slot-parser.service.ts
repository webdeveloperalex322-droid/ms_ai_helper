import { Injectable, Inject } from '@nestjs/common';
import { LLM_PROVIDER_TOKEN, LLMProvider, IntentResult } from '../providers/llm.provider.interface';
import {
  CategoryResolverService,
  LEGACY_CATEGORY_SLUGS,
} from '../../catalog/services/category-resolver.service';

const MAX_KNOWN_CATEGORIES = 40;

const KNOWN_INGREDIENTS = [
  'лосось',
  'краб',
  'тунец',
  'авокадо',
  'огурец',
  'сливочный сыр',
  'креветка',
];

@Injectable()
export class IntentSlotParserService {
  constructor(
    @Inject(LLM_PROVIDER_TOKEN) private readonly llmProvider: LLMProvider,
    private readonly categoryResolver: CategoryResolverService,
  ) {}

  async parse(
    message: string,
    context: { rn: string; target: string; screenContext?: string },
  ): Promise<IntentResult> {
    return this.llmProvider.parseIntent({
      message,
      screenContext: context.screenContext,
      target: context.target,
      knownCategories: await this.knownCategories(context.rn, context.target),
      knownIngredients: KNOWN_INGREDIENTS,
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

  /** Real catalog categories, so questions are not limited to a hardcoded list. */
  private async knownCategories(rn: string, target: string): Promise<string[]> {
    try {
      const options = await this.categoryResolver.listOptions(rn, target);
      const slugs = options.map((o) => o.slug).filter(Boolean);
      if (slugs.length) return slugs.slice(0, MAX_KNOWN_CATEGORIES);
    } catch {
      // Falls through to the legacy list — the assistant must keep answering.
    }

    return [...LEGACY_CATEGORY_SLUGS];
  }
}
