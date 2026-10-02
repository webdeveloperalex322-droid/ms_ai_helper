# Contract: ответ на вопрос о сервисе (`info_question`)

## 1. Намерение

`INTENT_VALUES` += `info_question`. Правило для парсера: вопросы о доставке (стоимость, зоны, время, минимальный заказ), оплате, бонусах/кешбэке, акциях и промокодах, адресах и часах работы ресторанов, самовывозе, компании, юридических условиях → `info_question`. `unsupported` — статус/история конкретного заказа, личный кабинет, жалобы, темы вне сервиса.

`MockLLMProvider.detectIntent`: ключевые слова `доставк|оплат|оплач|бонус|кешбэк|кэшбэк|акци|промокод|скидк|адрес|ресторан|работаете|режим работы|самовывоз|о компании|оферт|персональн` → `info_question`; проверка `статус|где мой заказ|мой заказ|история заказ` раньше неё → `unsupported`.

## 2. `LLMProvider.answerFromKnowledge`

```ts
interface KnowledgePassageInput { id: string; title: string; heading?: string; url: string; text: string }
interface KnowledgeAnswerInput { question: string; passages: KnowledgePassageInput[]; city_name?: string }
interface KnowledgeAnswerResult {
  answer_text: string;          // ответ на русском, ≤ ~600 символов
  used_passage_ids: string[];   // id фрагментов, на которые опирался ответ (подмножество входных)
  not_found: boolean;           // true — во фрагментах ответа нет
  quick_replies?: string[];
}
answerFromKnowledge(input: KnowledgeAnswerInput): Promise<KnowledgeAnswerResult>
```

Промпт (OpenAI): system — «отвечай только по переданным фрагментам; не выдумывай цены, сроки, адреса; если ответа нет — `not_found: true` и короткая фраза, что на сайте такой информации нет; без медицинских гарантий; JSON без markdown». Парсер `parseKnowledgeAnswerResponse(raw, passages)` фильтрует `used_passage_ids` по входным id, подставляет дефолтный текст при пустом `answer_text`.

Mock: `answer_text` = первые 300 символов текста первого фрагмента + «Подробнее на странице: <title>», `used_passage_ids = [first.id]`, `not_found = passages.length === 0`.

## 3. Поиск

```ts
interface KnowledgeSearchInput { query: string; rn: string; br: string; topK?: number /* 6 */ }
interface KnowledgePassage { chunkId: string; pageId: string; url: string; title: string; heading: string | null; text: string; score: number; semanticScore: number; keywordScore: number }
SiteKnowledgeSearchService.search(input): Promise<KnowledgePassage[]>
```

Векторная ветка: `1 - (embedding <=> query)` по `site_page_embeddings ⋈ site_page_chunks ⋈ site_pages` с `is_active`, `embedding_status='ready'`, `rn`, `br`; top 20. Ключевая: `ts_rank(to_tsvector('russian', text), to_tsquery('russian', 'w1:* & w2:*'))`, top 20, нормируется на максимум. Слияние по `chunkId`: `score = 0.7*semantic + 0.3*keywordNorm`; сортировка, `topK`. Любая ветка при ошибке → `[]`; обе пустые → `[]`.

## 4. `InfoAnswerService.answer`

```ts
interface InfoAnswerRequest { question: string; rn: string; br: string; target: string }
interface InfoAnswerResult {
  kind: 'answer' | 'not_found' | 'empty' | 'timeout';
  reply_text: string;
  quick_replies: string[];
  source?: { url: string; title: string };   // страница лучшего использованного фрагмента
  sources: string[];                          // url всех использованных страниц
}
```

| Ситуация | kind | reply_text | source |
|----------|------|-----------|--------|
| поиск вернул 0 фрагментов | `empty` | — (оркестратор берёт `FallbackService.forUnsupportedIntent()`) | нет |
| модель ответила, `not_found=false` | `answer` | `answer_text` после `sanitizeFreeText` | страница первого `used_passage_ids` (или лучшего по score) |
| модель ответила, `not_found=true` | `not_found` | `answer_text` (или заготовка «На сайте нет такой информации») | лучший по score |
| таймаут `LLM_TIMEOUT_MS` / ошибка | `timeout` | `FallbackService.forInfoTimeout(best)`: первые 400 символов лучшего фрагмента + «Подробнее: <title>» | лучший по score |

## 5. Ответ оркестратора

```jsonc
{
  "request_id": "...",
  "reply_text": "Оплатить можно наличными курьеру, картой онлайн ... ",
  "cards": [],
  "quick_replies": ["Условия доставки", "Бонусная программа"],
  "actions": [{ "type": "open_url", "url": "https://tyumen.sushi-master.ru/delivery", "title": "Доставка и оплата" }],
  "need_clarification": false,
  "clarification_question": null
}
```

`actions` пуст, если источника нет. `cards` всегда пуст.

## 6. Журнал

`ai_logs`: `intent='info_question'`, `validation_status` = `info_answer` | `info_not_found` | `info_empty` | `info_timeout`, `fallback_used` = true для `empty`/`timeout`, `llm_response = { kind: 'info', sources: [...], not_found }`, массивы товаров пустые.

## 7. Валидатор

`ResponseValidatorService.sanitizeFreeText(text): string` — публичный метод: заменяет `ALLERGY_SAFETY_PATTERNS` на «уточните состав у ресторана», обрезает до 1200 символов. `BANNED_TOPICS` не применяются.

## 8. Пресеты

`payload = { intent: 'info_question', slots: {}, retrieval_query: 'условия доставки' }`; оркестратор при `intent === 'info_question'` берёт вопрос из `user_message ?? retrieval_query`.
