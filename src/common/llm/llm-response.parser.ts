import {
  IntentResult,
  KnowledgeAnswerResult,
  KnowledgePassageInput,
  LLMRerankerResult,
  ProductCandidate,
} from '../../modules/assistant/providers/llm.provider.interface';

const DEFAULT_KNOWLEDGE_ANSWER = 'Подробности смотрите на странице сайта.';
const MAX_QUICK_REPLIES = 3;

/**
 * Normalizes the model's answer to a service question: only passage ids the
 * model was actually given survive, booleans are coerced, blank text gets a
 * neutral default so the caller can always show something next to the link.
 */
export function parseKnowledgeAnswerResponse(
  raw: string,
  passages: KnowledgePassageInput[],
): KnowledgeAnswerResult {
  const parsed = parseJson(raw);
  const allowedIds = new Set(passages.map((p) => p.id));

  const usedIds = Array.isArray(parsed.used_passage_ids)
    ? parsed.used_passage_ids.filter(
        (id: unknown): id is string => typeof id === 'string' && allowedIds.has(id),
      )
    : [];

  const quickReplies = Array.isArray(parsed.quick_replies)
    ? parsed.quick_replies
        .filter((item: unknown): item is string => typeof item === 'string' && item.trim() !== '')
        .slice(0, MAX_QUICK_REPLIES)
    : undefined;

  const answerText =
    typeof parsed.answer_text === 'string' && parsed.answer_text.trim()
      ? parsed.answer_text.trim()
      : DEFAULT_KNOWLEDGE_ANSWER;

  return {
    answer_text: answerText,
    used_passage_ids: [...new Set(usedIds)],
    not_found: Boolean(parsed.not_found),
    quick_replies: quickReplies,
  };
}

export function parseIntentResponse(raw: string): IntentResult {
  const parsed = parseJson(raw);

  return {
    intent: typeof parsed.intent === 'string' ? parsed.intent : 'product_recommendation',
    slots: normalizeSlots(parsed.slots),
    need_clarification: Boolean(parsed.need_clarification),
    clarification_question:
      typeof parsed.clarification_question === 'string' ? parsed.clarification_question : null,
    confidence: clampConfidence(parsed.confidence),
  };
}

export function parseRerankResponse(
  raw: string,
  candidates: ProductCandidate[],
  maxCards: number,
): LLMRerankerResult {
  const parsed = parseJson(raw);
  const allowedIds = new Set(candidates.map((c) => c.product_id));

  const selected = Array.isArray(parsed.selected)
    ? parsed.selected
        .filter(
          (item: unknown): item is { product_id: string; reason: string } =>
            typeof item === 'object' &&
            item !== null &&
            typeof (item as { product_id?: unknown }).product_id === 'string' &&
            allowedIds.has((item as { product_id: string }).product_id),
        )
        .map((item) => ({
          product_id: item.product_id,
          reason: typeof item.reason === 'string' ? item.reason : 'подходит по запросу',
        }))
        .slice(0, maxCards)
    : [];

  const quickReplies = Array.isArray(parsed.quick_replies)
    ? parsed.quick_replies.filter((item: unknown): item is string => typeof item === 'string')
    : undefined;

  return {
    selected,
    reply_text:
      typeof parsed.reply_text === 'string' && parsed.reply_text.trim()
        ? parsed.reply_text.trim()
        : 'Подобрал варианты из актуального меню.',
    quick_replies: quickReplies,
    need_clarification: Boolean(parsed.need_clarification),
    clarification_question:
      typeof parsed.clarification_question === 'string' ? parsed.clarification_question : null,
  };
}

function parseJson(raw: string): Record<string, any> {
  const trimmed = raw.trim();
  const jsonText = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    : trimmed;

  const parsed = JSON.parse(jsonText);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('LLM response is not a JSON object');
  }
  return parsed;
}

function normalizeSlots(slots: unknown): IntentResult['slots'] {
  if (typeof slots !== 'object' || slots === null) {
    return {};
  }

  const source = slots as Record<string, unknown>;
  const result: IntentResult['slots'] = {};

  if (typeof source.city_id === 'string') result.city_id = source.city_id;
  if (typeof source.target === 'string') result.target = source.target;
  if (typeof source.category === 'string') result.category = source.category;
  if (typeof source.budget_max === 'number') result.budget_max = source.budget_max;
  if (typeof source.spicy === 'boolean') result.spicy = source.spicy;
  if (typeof source.people_count === 'number') result.people_count = source.people_count;
  if (typeof source.scenario === 'string') result.scenario = source.scenario;
  if (typeof source.allergy_risk === 'boolean') result.allergy_risk = source.allergy_risk;

  result.preferred_ingredients = toStringArray(source.preferred_ingredients);
  result.excluded_ingredients = toStringArray(source.excluded_ingredients);
  result.taste = toStringArray(source.taste);
  result.product_mentions = toStringArray(source.product_mentions);
  result.excluded_product_names = toStringArray(source.excluded_product_names);

  return result;
}

function toStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === 'string');
  return items.length ? items : undefined;
}

function clampConfidence(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0.7;
  }
  return Math.min(1, Math.max(0, value));
}
