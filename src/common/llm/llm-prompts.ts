import {
  IntentParseInput,
  KnowledgeAnswerInput,
  KnowledgePassageInput,
  ProductCandidate,
  RerankerInput,
} from '../../modules/assistant/providers/llm.provider.interface';

const INTENT_VALUES = [
  'product_recommendation',
  'product_question',
  'product_compare',
  'product_filter',
  'nutrition_question',
  'allergen_question',
  'info_question',
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
1. Сначала определи, о чём вопрос: о блюдах меню или о сервисе.
   - info_question — вопрос о сервисе, а не о конкретных блюдах: доставка (стоимость, зоны, время,
     минимальный заказ), оплата (как и чем оплатить), бонусы и кешбэк, акции и промокоды, адреса и
     часы работы ресторанов, самовывоз, компания, юридические условия, контакты поддержки.
     Примеры: «как можно оплатить заказ», «сколько стоит доставка», «какие акции сейчас»,
     «где ваши рестораны», «до скольки работаете» → info_question, slots пустые.
   - unsupported — статус или история конкретного заказа, личный кабинет, жалобы, темы вне доставки еды.
   - Если в вопросе названо блюдо или категория меню — это товарный intent, даже если рядом есть слова
     про доставку или цену.
2. Списки «Категории» и «Ингредиенты» в контексте — это справочник того, что бывает в меню,
   а НЕ предпочтения пользователя. Заполняй preferred_ingredients, excluded_ingredients, category
   только тем, что пользователь сам назвал в сообщении. Если он ничего не назвал — оставь slots пустыми.
3. budget_max — число в рублях, если пользователь указал бюджет («до 1500»).
4. excluded_ingredients — ингредиенты после «без».
5. need_clarification=true только если без уточнения нельзя подобрать товары.
6. confidence — число от 0 до 1.`;

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

/**
 * Service question answered from site page fragments. The model is pinned to
 * the passages: no invented prices, hours or addresses, and an explicit
 * `not_found` when the passages do not cover the question.
 */
export function buildKnowledgeAnswerMessages(input: KnowledgeAnswerInput) {
  const system = `Ты помощник службы доставки суши «Суши Мастер». Отвечаешь на вопросы о сервисе:
доставка, оплата, бонусы, акции, рестораны, компания, условия.

Правила:
- Отвечай ТОЛЬКО по приведённым фрагментам страниц сайта. Не выдумывай цены, сроки, адреса,
  проценты и условия, которых нет во фрагментах.
- Если во фрагментах нет ответа на вопрос — поставь not_found: true и коротко скажи, что на сайте
  такой информации нет, и предложи уточнить у поддержки ресторана.
- Не давай медицинских гарантий (по аллергиям и т. п.).
- Отвечай кратко (до 600 символов), по-русски, дружелюбно, без markdown внутри текста.
- В used_passage_ids перечисли id фрагментов, на которые опирался ответ.
- quick_replies — до 3 коротких следующих вопросов по теме.
- Верни ТОЛЬКО валидный JSON без markdown.`;

  const passages = input.passages.map((p) => formatPassage(p)).join('\n\n');

  const userContent = [
    `Вопрос пользователя: ${input.question}`,
    input.city_name ? `Город: ${input.city_name}` : null,
    `Фрагменты страниц сайта (${input.passages.length}):\n${passages}`,
    `Формат ответа:
{
  "answer_text": "ответ пользователю",
  "used_passage_ids": ["id1"],
  "not_found": false,
  "quick_replies": ["вопрос 1", "вопрос 2"]
}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: userContent },
  ];
}

function formatPassage(passage: KnowledgePassageInput): string {
  const header = passage.heading ? `${passage.title} › ${passage.heading}` : passage.title;
  return `[${passage.id}] ${header}\n${passage.text}`;
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
