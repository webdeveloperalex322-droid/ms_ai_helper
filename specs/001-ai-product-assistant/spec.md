# Feature Specification: AI Product Assistant — MVP Backend

**Feature Branch**: `001-ai-product-assistant`

**Created**: 2026-06-26

**Status**: Draft → Validated

**Source**: `docs/technical_design_ai_product_assistant.md` v1.1

---

## Product Scope

Отдельный backend-сервис, который отвечает на вопросы пользователей **только по товарам** каталога доставки роллов и суши. Сервис не заменяет корзину и не обрабатывает заказы — он помогает покупателю выбрать подходящие блюда из актуального прайс-листа конкретного города.

---

## Out of Scope

| Тема | Причина исключения |
|---|---|
| История заказов клиента | Не нужна для подбора товаров; персональные данные вне MVP |
| Персонализация по прошлым заказам | Out of scope v1 |
| Статус, повтор, отмена заказа | Не товарные вопросы |
| Профиль клиента, адреса, бонусы, промокоды | Персональные данные |
| Доставка и оплата | Только fallback-сообщение «помогаю только с товарами» |
| CRM, Telegram-бот, операторская панель | Отдельные каналы вне MVP |
| Автоматическая генерация подсказок LLM без модерации | Требует модерации; вне MVP |
| A/B-тесты, ML-рекомендации «похожих пользователей» | Вне MVP |
| Полноценная UI-админка | Управление через internal API / seed |
| user_id / авторизация пользователя | Не передаётся в прототипе |

---

## User Scenarios & Testing

### User Story 1 — Подбор товаров по запросу (Priority: P1)

Пользователь открывает каталог и задаёт вопрос на естественном языке: «Подбери сет на двоих до 1500 рублей без острого». Система разбирает запрос, находит подходящие товары из актуального прайса города, ранжирует их и возвращает текстовый ответ с карточками товаров.

**Why this priority**: Это основной сценарий ценности — замена ручного поиска по каталогу. Без него сервис бессмысленен.

**Independent Test**: Выполнить `POST /v1/assistant/product-answer` с текстовым запросом → получить ответ с карточками. Проверить, что цены из ответа совпадают с ценами в БД.

**Acceptance Scenarios**:

1. **Given** в БД есть товары (сеты) для города `br`, `price <= 1500`, без острого, **When** запрос `{"user_message": "Подбери сет до 1500 без острого", "br": "city-guid"}`, **Then** ответ содержит `cards` с `price <= 1500`, ни один товар не содержит острые теги/ингредиенты.
2. **Given** подходящих товаров нет, **When** тот же запрос, **Then** ответ содержит `need_clarification: true` или fallback-текст, `cards: []`.
3. **Given** LLM недоступна (таймаут), **When** запрос поступает, **Then** возвращается top-N по скорингу без LLM-объяснения, без ошибки 5xx.

---

### User Story 2 — Вопрос по конкретному товару (Priority: P1)

Пользователь спрашивает «Что входит в Филадельфию?» или «Сколько калорий?». Система находит товар по названию, берёт факты (состав, КБЖУ, вес) из локальной БД и возвращает точный ответ без выдумывания.

**Why this priority**: Это наиболее распространённый тип вопроса на товарных страницах.

**Independent Test**: Выполнить `POST /v1/assistant/product-answer` с `user_message: "Что входит в Филадельфию?"` → ответ содержит ингредиенты, которые совпадают с полем `ingredients` в таблице `products`.

**Acceptance Scenarios**:

1. **Given** товар «Филадельфия классическая» есть в БД для данного `br`, **When** `user_message: "Что входит в Филадельфию?"`, **Then** `reply_text` содержит состав из поля `ingredients`, `cards` содержит карточку товара, цена совпадает с `city_products.price`.
2. **Given** найдены два товара «Филадельфия классическая» и «Филадельфия лайт», **When** запрос, **Then** `need_clarification: true`, `clarification_question` содержит уточняющий вопрос, обе карточки в `cards`.
3. **Given** товар есть в БД, но `is_available: false` для данного города, **When** запрос, **Then** в ответе указано, что товар недоступен в данном городе.

---

### User Story 3 — Пресет-подсказки как сценарии подбора (Priority: P1)

UI показывает набор подсказок («🐟 Только с лососем», «💸 До 1000 ₽», «🔥 Популярные роллы»). Подсказки возвращаются динамически с учётом города и платформы. При клике на подсказку запускается тот же pipeline, что и для обычного запроса, но с заранее заданным `intent`/`slots`/`retrieval_query` из payload подсказки.

**Why this priority**: Пресет-подсказки — ключевой UX-элемент, снижающий порог входа. Входят в основной скоуп v1.1.

**Independent Test**: `GET /v1/assistant/suggestions?rn=...&br=...&target=WEB` возвращает список подсказок. `POST /v1/assistant/product-answer` с `suggestion_id` возвращает карточки, соответствующие payload подсказки.

**Acceptance Scenarios**:

1. **Given** в БД есть активные подсказки для данного `rn/br/target`, **When** `GET /v1/assistant/suggestions`, **Then** возвращается только `enabled=true`, только подходящие по периоду активности и `allowed_br`, только те, у которых есть доступные товары (если `hide_if_empty=true`).
2. **Given** подсказка `only_salmon` активна и в городе есть роллы с лососем, **When** `POST /product-answer` с `suggestion_id: "uuid-of-only_salmon"`, **Then** все карточки содержат лосось в ингредиентах; событие `clicked` записано в аналитику.
3. **Given** подсказка активна, но товаров нет, **When** клик, **Then** возвращается `fallback_payload` подсказки; событие `empty_result` записано.

---

### User Story 4 — Импорт городов и товаров из внешнего API (Priority: P1)

Администратор или scheduled job вызывает внутренние endpoints для импорта городов и прайс-листов товаров по каждому активному городу. Данные нормализуются и сохраняются в локальную БД. После импорта товары готовы к поиску.

**Why this priority**: Без импорта каталог пуст и все остальные сценарии не работают.

**Independent Test**: Вызвать `POST /v1/internal/import/cities` → дождаться завершения job → проверить, что `cities` содержит записи. Вызвать `POST /v1/internal/import/products` → `products` и `city_products` содержат записи.

**Acceptance Scenarios**:

1. **Given** внешний API доступен, **When** `POST /v1/internal/import/cities {"rn": "..."}`, **Then** `cities` обновлены (upsert), `import_jobs` содержит запись со статусом `success`.
2. **Given** города импортированы, **When** `POST /v1/internal/import/products {"rn":"...", "br":"...", "target":"WEB", "mode":"full"}`, **Then** `products` и `city_products` содержат товары с корректными ценами и флагами доступности.
3. **Given** API возвращает 5xx, **When** импорт, **Then** retry с exponential backoff; после исчерпания попыток job status = `partial_failed`, старые данные не удалены.

---

### User Story 5 — Сравнение товаров и аллергенные ограничения (Priority: P2)

Пользователь сравнивает два товара или уточняет наличие аллергена. Система берёт только факты из БД, не выдумывает состав, не гарантирует абсолютную безопасность.

**Why this priority**: Расширяет базовый P1-сценарий, но не блокирует MVP.

**Independent Test**: `POST /product-answer` с `user_message: "Чем отличается Филадельфия от Калифорнии?"` → ответ содержит факты по обоим товарам из БД. `user_message: "Есть ли креветка в этом ролле?"` → ответ берётся только из поля `allergens`/`ingredients`.

**Acceptance Scenarios**:

1. **Given** оба товара есть в БД для данного города, **When** запрос на сравнение, **Then** `cards` содержит обе карточки, `reply_text` использует только поля из БД.
2. **Given** пользователь спрашивает об аллергии, **When** запрос, **Then** ответ не гарантирует «100% безопасно», содержит дисклеймер о необходимости уточнить у ресторана.

---

### Edge Cases

- Пустой `user_message` при `suggestion_id` — использовать payload подсказки.
- Товар есть глобально, но недоступен в данном `br` — сообщить об этом, не показывать.
- Неизвестный `br` в запросе — вернуть 400 с понятным сообщением.
- LLM выбрала `product_id` вне shortlist — удалить из ответа; если пустой ответ — fallback.
- Запрос «Где мой заказ?» — intent `unsupported`, стандартный fallback.
- Запрос содержит запрещённую фразу — validator удаляет/заменяет.
- Embedding build упал — товар доступен для keyword search, не для vector search.

---

## Requirements

### Functional Requirements

- **FR-001**: Система ДОЛЖНА принимать `POST /v1/assistant/product-answer` с полями `rn`, `br`, `target`, `user_message`/`suggestion_id` и возвращать `reply_text`, `cards`, `quick_replies`, `actions`, `need_clarification`.
- **FR-002**: Система ДОЛЖНА принимать `GET /v1/assistant/suggestions` и возвращать только активные, доступные в данном городе подсказки.
- **FR-003**: Система ДОЛЖНА поддерживать `POST /v1/internal/import/cities` и `POST /v1/internal/import/products` для загрузки каталога.
- **FR-004**: Система ДОЛЖНА применять фильтр города (`br`) до vector search и до LLM.
- **FR-005**: Система ДОЛЖНА применять фильтры бюджета, ингредиентов, острота кодом, не доверяя их LLM.
- **FR-006**: Все ответы ДОЛЖНЫ проходить валидатор: `product_id` существует, доступен в `br`, цена/состав не изменены LLM.
- **FR-007**: При отсутствии подходящих товаров ДОЛЖЕН срабатывать fallback (шаблонный текст + `quick_replies`).
- **FR-008**: Система ДОЛЖНА логировать каждый запрос: `request_id`, intent, slots, retrieved_ids, selected_ids, validation_status, latency.
- **FR-009**: Система ДОЛЖНА записывать аналитические события: `suggestion_shown`, `suggestion_clicked`, `product_card_clicked`, `add_to_cart`, `feedback_like/dislike`.
- **FR-010**: LLM и embedding-провайдеры ДОЛЖНЫ быть заменяемыми через интерфейсы (поддерживать mock-режим без реального LLM).
- **FR-011**: Подсказки ДОЛЖНЫ храниться как управляемые объекты с `payload`, `availability_rules`, `fallback_payload`; НЕЛЬЗЯ передавать текст подсказки напрямую в LLM.
- **FR-012**: Импорт ДОЛЖЕН поддерживать dry-run режим для отладки.
- **FR-013**: Система ДОЛЖНА поддерживать `POST /v1/assistant/feedback` для сбора лайков/дизлайков.
- **FR-014**: Система ДОЛЖНА поддерживать `POST /v1/assistant/events` для аналитических событий от UI.
- **FR-015**: Internal suggestion admin endpoints (`GET/POST/PATCH /v1/internal/assistant/suggestions`) ДОЛЖНЫ быть реализованы.

### Non-Functional Requirements

- **NFR-001**: `POST /v1/assistant/product-answer` — p95 latency < 3 секунд при mock LLM.
- **NFR-002**: Retrieval (vector + keyword) — < 500 мс.
- **NFR-003**: Все внешние секреты — только через env-переменные, не в коде.
- **NFR-004**: Публичные API-эндпоинты защищены schema validation (400 на невалидный запрос).
- **NFR-005**: Ошибки возвращаются в едином формате `{"error": {"code": "...", "message": "..."}}`.
- **NFR-006**: Сервис готов к docker-compose запуску одной командой.
- **NFR-007**: Покрытие тестами: unit + integration для каждого модуля.

### Key Entities

- **RetailNetwork**: торговая сеть (`rn`), привязка всех данных.
- **City**: GUID города (`br`), актуальный прайс-лист.
- **Product**: глобальная карточка товара (состав, КБЖУ, теги).
- **CityProduct**: городовая проекция товара (цена, наличие, target).
- **ProductChunk**: текстовый документ для RAG (searchable_text, metadata).
- **ProductEmbedding**: векторное представление chunk-а.
- **AssistantSuggestion**: преднастроенная подсказка с payload и правилами показа.
- **AssistantSession**: краткий диалоговый контекст с TTL (без истории заказов).
- **AiLog**: полная запись каждого запроса к помощнику.
- **AssistantSuggestionEvent**: аналитическое событие по подсказке.
- **ImportJob**: запись о статусе и результате импорта.
- **AdminRule**: настройки тональности, лимитов, запрещённых фраз.

---

## API Contracts

### POST /v1/assistant/product-answer

**Request**:
```json
{
  "channel": "site",
  "session_id": "abc123",
  "rn": "A79C5050-1EE7-11EB-9B6E-05B5FC40DF2A",
  "br": "city-guid",
  "target": "WEB",
  "screen_context": "catalog",
  "user_message": "Подбери сет на двоих до 1500 рублей без креветки",
  "suggestion_id": null
}
```

**Response**:
```json
{
  "request_id": "uuid",
  "reply_text": "...",
  "cards": [
    {
      "product_id": "uuid",
      "name": "Сет Лосось дуэт",
      "price": 1390,
      "currency": "RUB",
      "image_url": "https://...",
      "reason": "на двоих, до 1500 ₽, без креветки",
      "ui_action": "show_product_card"
    }
  ],
  "quick_replies": ["Показать дешевле", "Только с лососем"],
  "actions": [{"type": "show_products", "product_ids": ["uuid"]}],
  "need_clarification": false,
  "clarification_question": null,
  "debug": null
}
```

### GET /v1/assistant/suggestions

**Query params**: `rn`, `br`, `target`, `screen_context`

**Response**:
```json
{
  "suggestions": [
    {
      "id": "uuid",
      "code": "only_salmon",
      "title": "🐟 Только с лососем",
      "sort_order": 120,
      "payload_preview": {"intent": "product_recommendation", "category": "roll", "tags": ["лосось"]}
    }
  ]
}
```

### POST /v1/assistant/feedback
### POST /v1/assistant/events
### POST /v1/internal/import/cities
### POST /v1/internal/import/products
### POST /v1/internal/import/products/by-ids
### GET/POST/PATCH /v1/internal/assistant/suggestions

---

## Data Model

Таблицы (PostgreSQL + pgvector):

| Таблица | Назначение |
|---|---|
| `retail_networks` | Торговые сети |
| `cities` | Города / br |
| `products` | Глобальные карточки товаров |
| `city_products` | Городовые проекции (цена, наличие) |
| `product_chunks` | Текстовые документы для RAG |
| `product_embeddings` | Векторные представления (pgvector VECTOR(1536)) |
| `assistant_sessions` | Диалоговый контекст, TTL |
| `ai_logs` | Полный лог каждого запроса |
| `assistant_suggestions` | Преднастроенные подсказки с payload |
| `assistant_suggestion_events` | Аналитика событий подсказок |
| `admin_rules` | Настройки ассистента |
| `import_jobs` | Статусы и статистика импорта |

---

## RAG Pipeline

1. Для каждого товара × город генерируется `searchable_text` (название, категория, состав, аллергены, теги, КБЖУ, цена, город, доступность).
2. Embedding провайдер (interface) генерирует VECTOR(1536); в dev — mock (random/deterministic).
3. Hybrid retrieval: vector similarity (pgvector cosine) + keyword BM25-like.
4. Metadata pre-filter: `rn`, `br`, `target`, `is_available`, `is_valid`, `price`, `excluded_ingredients`.
5. Scoring: semantic 35% + keyword 20% + slot_match 25% + availability 10% + business_priority 5% + popularity 5%.
6. Shortlist 10–30 кандидатов → в LLM.

---

## Import Pipeline

1. `GET /v1/cities?rn=...` → upsert `cities`.
2. По каждому активному `br` × `category_id` → `GET /v1/products?rn=...&br=...&cat=...`.
3. Нормализация: extraction всех полей в схему `products` + `city_products`.
4. Товары без цены/состава → `is_valid=false`.
5. Товары отсутствующие в новом импорте → `is_available=false`.
6. Генерация `searchable_text` → `product_chunks`.
7. Очередь на embedding rebuild.

---

## Suggestions / Preset Prompts

- Подсказки хранятся в `assistant_suggestions` с полями `payload` (intent + slots + retrieval_query) и `availability_rules`.
- При клике UI передаёт `suggestion_id` в `POST /product-answer`.
- Сервис загружает payload, проверяет правила показа, запускает стандартный RAG pipeline.
- Текст подсказки НЕ передаётся в LLM как свободный промпт.
- Seed: 21 подсказка из раздела 10.1 ТЗ.

---

## Validation Rules

1. Все `product_id` в ответе существуют в БД.
2. Все товары доступны в текущем `br` и `target`.
3. Цена в ответе = цена в `city_products`.
4. Название в ответе = название в `products`.
5. Товары только из shortlist, не придуманные LLM.
6. Бюджетный фильтр не нарушен: `price <= slots.budget_max`.
7. Исключённые ингредиенты отсутствуют в составе/аллергенах.
8. Острота: если `spicy=false`, нет острых тегов.
9. Текст не содержит запрещённых фраз из `admin_rules.banned_phrases`.
10. Нет обещаний «100% безопасно при аллергии».
11. Нет упоминаний истории заказов, статуса заказа, доставки, оплаты.
12. Количество карточек ≤ `admin_rules.max_cards_in_response`.

---

## Fallback Scenarios

| Ситуация | Поведение |
|---|---|
| LLM timeout / недоступна | Топ-N по скорингу, шаблонный текст |
| LLM вернула некорректный JSON | Retry 1 раз, затем fallback |
| LLM выбрала product_id вне shortlist | Удалить; если остались валидные — использовать их; иначе fallback |
| Нет подходящих товаров | Уточняющий вопрос или предложение снять ограничение |
| Intent = unsupported | «Я пока помогаю только с вопросами по товарам» |
| Подсказка ведёт к пустой выдаче | Вернуть `fallback_payload` подсказки |
| API импорта недоступен | Retry + exponential backoff; old data preserved |

---

## Observability / Logging

**Метрики** (структурированные события): `assistant_requests_total`, `assistant_latency_ms`, `llm_latency_ms`, `retrieval_latency_ms`, `validation_failed_total`, `fallback_used_total`, `empty_result_total`, `suggestion_shown_total`, `suggestion_clicked_total`, `import_success_total`, `embedding_build_failed_total`.

**Логи**: `request_id`, intent, slots, suggestion_id/code, filters, retrieved_ids, selected_ids, validation_status, fallback_reason, latency.

**Не логировать**: историю заказов, адреса, телефоны, платёжные данные.

---

## Acceptance Criteria

| # | Критерий | Проверяется |
|---|---|---|
| AC-01 | `POST /product-answer` возвращает карточки с реальными ценами из БД | Unit/Integration test |
| AC-02 | LLM не может придумать товар вне shortlist — валидатор удаляет его | Unit test Validator |
| AC-03 | Фильтр города применяется до retrieval — товары другого `br` не попадают | Integration test |
| AC-04 | Бюджетный фильтр применяется кодом — `price > budget_max` не проходит | Unit test |
| AC-05 | Исключённые ингредиенты не появляются в ответе | Unit test |
| AC-06 | При `unsupported` intent возвращается fallback без ошибки | Unit test |
| AC-07 | `GET /suggestions` скрывает подсказки без доступных товаров | Integration test |
| AC-08 | Клик по подсказке через `suggestion_id` запускает RAG с payload подсказки | Integration test |
| AC-09 | Импорт городов: upsert, import_jobs запись, старые данные сохранены при ошибке | Integration test |
| AC-10 | Импорт товаров: city_products обновлены, searchable_text создан | Integration test |
| AC-11 | Аналитические события записываются для suggestion_shown/clicked/empty | Integration test |
| AC-12 | Mock LLM/embedding провайдеры работают без реального API | Unit test |
| AC-13 | Docker Compose запускает весь стек с одной команды | Manual / CI |
| AC-14 | Невалидный запрос возвращает 400 с `error.code` | Contract test |
| AC-15 | e2e: seed → import → product-answer возвращает структурированный ответ | e2e test |

---

## Assumptions

- LLM в MVP — mock/stub; реальный провайдер подключается через env-переменную.
- Embedding в MVP — детерминированный mock; реальный — через env.
- `target` по умолчанию `WEB`; мобильный target в MVP не тестируется отдельно, но поддерживается в схеме.
- Все внешние API вызовы имеют mock-режим для локальной разработки и тестов.
- `session_id` — технический идентификатор, не личные данные.
- Категории товаров фиксированы в конфиге; фактические `category_id` сопоставляются после первого реального импорта.
- База данных — PostgreSQL 16 + pgvector 0.7+.
- Период активности подсказок без задания `active_from/active_to` считается всегда активным.
