import { IntentParseInput, ProductCandidate, RerankerInput } from '../../modules/assistant/providers/llm.provider.interface';

const INTENT_VALUES = [
  'product_recommendation',
  'product_question',
  'product_compare',
  'product_filter',
  'nutrition_question',
  'allergen_question',
  'unsupported',
] as const;

export function buildIntentParseMessages(input: IntentParseInput) {
  const system = `Ты парсер намерений для AI-помощника доставки суши и роллов.
Верни ТОЛЬКО валидный JSON без markdown.

Допустимые intent: ${INTENT_VALUES.join(', ')}.

Поля slots (все опциональны):
- city_id, target, category, budget_max, preferred_ingredients, excluded_ingredients,
  taste, spicy (true/false/null), people_count, product_mentions, scenario,
  excluded_product_names, allergy_risk (boolean).

Правила:
- unsupported — вопросы про заказ, доставку, оплату, бонусы, промокоды.
- budget_max — число в рублях, если пользователь указал бюджет («до 1500»).
- excluded_ingredients — ингредиенты после «без».
- need_clarification=true только если без уточнения нельзя подобрать товары.
- confidence — число от 0 до 1.`;

  const contextParts: string[] = [];
  if (input.screenContext) contextParts.push(`Экран: ${input.screenContext}`);
  if (input.target) contextParts.push(`Канал: ${input.target}`);
  if (input.knownCategories?.length) {
    contextParts.push(`Категории: ${input.knownCategories.join(', ')}`);
  }
  if (input.knownIngredients?.length) {
    contextParts.push(`Ингредиенты: ${input.knownIngredients.join(', ')}`);
  }

  const userContent = [
    `Сообщение пользователя: ${input.message}`,
    contextParts.length ? `Контекст:\n${contextParts.join('\n')}` : null,
    `Формат ответа:
{
  "intent": "...",
  "slots": {},
  "need_clarification": false,
  "clarification_question": null,
  "confidence": 0.9
}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: userContent },
  ];
}

export function buildRerankMessages(input: RerankerInput) {
  const maxCards = input.max_cards ?? 5;
  const candidatesJson = input.candidates.map((c) => formatCandidate(c));

  const system = `Ты помощник по подбору товаров из меню доставки суши.
Выбирай ТОЛЬКО product_id из переданного списка кандидатов.
Не придумывай товары, цены и состав.
Не давай медицинских гарантий по аллергиям.
Верни ТОЛЬКО валидный JSON без markdown.`;

  const userContent = [
    `Запрос пользователя: ${input.user_request}`,
    `Ограничения: ${JSON.stringify(input.constraints)}`,
    `Кандидаты (${input.candidates.length}):\n${candidatesJson.join('\n')}`,
    `Выбери до ${maxCards} лучших товаров.`,
    `Формат ответа:
{
  "selected": [{"product_id": "...", "reason": "краткая причина на русском"}],
  "reply_text": "короткий ответ пользователю",
  "quick_replies": ["вариант 1", "вариант 2"],
  "need_clarification": false,
  "clarification_question": null
}`,
  ].join('\n\n');

  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: userContent },
  ];
}

function formatCandidate(candidate: ProductCandidate): string {
  const parts = [
    `id=${candidate.product_id}`,
    `name=${candidate.name}`,
    `price=${candidate.price} ${candidate.currency}`,
  ];
  if (candidate.ingredients?.length) parts.push(`ingredients=${candidate.ingredients.join(', ')}`);
  if (candidate.allergens?.length) parts.push(`allergens=${candidate.allergens.join(', ')}`);
  if (candidate.tags?.length) parts.push(`tags=${candidate.tags.join(', ')}`);
  if (candidate.category_id) parts.push(`category=${candidate.category_id}`);
  return `- ${parts.join('; ')}`;
}
