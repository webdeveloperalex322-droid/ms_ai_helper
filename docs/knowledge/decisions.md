# Decisions (ADR log)

The _why_ behind non-obvious choices. Add an entry when you make a decision that a future reader (human or Claude) would otherwise have to reverse-engineer from code. Newest at top.

Format: **Decision** — Context / Why — Consequences.

---

## ADR-015: Знания сайта — отдельные таблицы и свой индексатор, а не расширение product_chunks

**Decision:** Страницы сайта живут в `site_pages` → `site_page_chunks` → `site_page_embeddings` (vector 1536), с собственным `SitePageIndexerService` (пачки по 32 через `EmbeddingProvider.embedBatch`, один повтор на ретраибельной ошибке) и `SiteKnowledgeSearchService`. `EmbeddingService`/`RagBulkIndexerService` товарного RAG не обобщались. Общий `customType vector` вынесен в `schema/vector.ts`.
**Why:** `product_chunks.product_id` — NOT NULL FK на `products`, а товарный поиск везде JOIN-ит `city_products` по доступности — добавить туда «чанки без товара» значит ослабить инварианты рабочего пути ради десятков строк. Объём знаний (10–30 страниц, ~100 чанков на город) не оправдывает машинерию bulk-индексатора. Правило «уже проиндексировано» то же, что в ADR-010: hash + model + все чанки `ready`.
**Where:** [site-pages.ts](../../src/database/schema/site-pages.ts), [site-page-import.service.ts](../../src/modules/site-knowledge/services/site-page-import.service.ts), [site-knowledge-search.service.ts](../../src/modules/site-knowledge/services/site-knowledge-search.service.ts). Спека [011-site-info-knowledge](../../specs/011-site-info-knowledge/spec.md).
**Consequences:** Смена `EMBEDDING_MODEL` требует переимпорта снимков (`site:import` сам переиндексирует — модель не совпала). Веса слияния 0.7/0.3 и top-6 — константы модуля, подбираются по набору вопросов из quickstart. `InfoAnswerService` живёт в `assistant/` (нужны `LLMProvider`, валидатор, fallback), `SiteKnowledgeModule` экспортирует только поиск — цикла модулей нет. Для сервисных ответов валидатор применяет только `sanitizeFreeText` (медицинские гарантии + обрезка): `BANNED_TOPICS` намеренно перечисляет именно темы доставки/оплаты/бонусов и к таким ответам неприменим.

## ADR-014: Информационные страницы сайта собираются рендером в браузере офлайн, снимок хранится в репозитории

**Decision:** Краулер `pnpm site:crawl` рендерит страницы города в headless Chromium (`puppeteer-core` + системный Edge/Chrome, без загрузки собственного браузера) и пишет снимок `data/site-pages/<city>.json`; `pnpm site:import` загружает снимок в БД без обращения к сайту. Браузер нужен только на машине оператора.
**Why:** Сайт `*.sushi-master.ru` — клиентский Next.js: в серверном HTML только `<title>` и мета, текст рисуется скриптами (обследование 2026-10-01/02, [research.md](../../specs/011-site-info-knowledge/research.md)). Контент размазан по трём источникам (бренд-чанки JS с `\uXXXX`-текстом, словари `/locales/ru/*.json`, venus `/v1/init|restaurants|deliveryZones`), а акции и юридические документы REST-ом не достаются — вероятно Firestore. Браузер видит то же, что пользователь, и не зависит от внутренностей сайта. Сайт отвечает 25–170 с на страницу, тела chunked-ответов обрываются — поэтому таймаут страницы 180 с, `protocolTimeout` 600 с, навигационный таймаут не считается ошибкой (DOM уже заполнен), «Execution context was destroyed» → повтор. На проде нет браузера и `src/`, зато есть практика одноразового контейнера для `rag:index-all` — импорт снимка идёт тем же путём, а сам снимок приезжает с `git pull` и ревьюится глазами.
**Where:** [headless-browser.fetcher.ts](../../src/modules/site-knowledge/crawler/headless-browser.fetcher.ts), [html-text-extractor.ts](../../src/modules/site-knowledge/crawler/html-text-extractor.ts), [site-crawler.service.ts](../../src/modules/site-knowledge/crawler/site-crawler.service.ts), [scripts/site-crawl.ts](../../scripts/site-crawl.ts), [scripts/site-import.ts](../../scripts/site-import.ts).
**Consequences:** Обновление знаний — ручной перезапуск сбора и коммит снимка (акции меняются часто; расписание — отдельная работа). Экстрактор держится на вёрстке сайта (`main`, удаление `header/footer/nav/.breadcrumb/.we-use-cookies/.switcher`, промоция `.title` → `###`): редизайн ломает качество текста, а не сборку — фикстуры в `tests/fixtures/` зафиксировали текущую вёрстку, порог 200 символов ловит пустые страницы. `puppeteer-core` и `cheerio` — обычные зависимости (попадают в прод-образ, но приложением не загружаются; Chromium не скачивается).

## ADR-013: Client rate limits key on consumer _and_ address; trustProxy is a hop count

**Decision:** `ConsumerThrottlerGuard` keys the `client` contour by `consumer:<label>|ip:<req.ip>`, the `internal` contour by `consumer:<label>` alone, and never reads `req.ips[0]`. The Fastify adapter uses `trustProxy: 1`, and nginx sets `X-Forwarded-For $remote_addr` (overwrite, not `$proxy_add_x_forwarded_for`).
**Why:** The client key ships inside the browser widget, so it is public and every visitor presents the same label. Keyed by label alone, `THROTTLE_COSTLY_LIMIT=10` meant 10 requests per minute for the whole site — one visitor with DevTools could hand everyone else a 429, and honest growth would hit the same wall. The label stays in the key, so the original guarantee still holds: two integrators behind one office NAT cannot eat each other's quota. Internal keys stay label-only because one operator may legitimately call from a changing address (CI runner, cron host).
`req.ips[0]` is the _leftmost_ X-Forwarded-For entry — written by the caller — so keying on it let an attacker mint a fresh counter per request; `trustProxy: true` had the same effect on `req.ip`. A hop count of 1 trusts only our nginx, and the nginx-side overwrite drops any forged prefix at the edge, so the two changes are independent layers.
**Where:** [consumer-throttler.guard.ts](../../src/common/throttling/consumer-throttler.guard.ts), [main.ts](../../src/main.ts), `docker/nginx/templates/http.conf`, `scripts/enable-ssl.sh`.
**Consequences:** Client counters now multiply by visitor, so `THROTTLE_COSTLY_LIMIT` is a _per-visitor_ budget — re-tune it as a per-person number, not a site total. The throttler store is still in-memory, so a second app replica would keep its own counters; scaling out needs a Redis storage adapter. `TRUST_PROXY=true` without a real proxy in front is now a hole, not merely a wrong reading — and the flag can finally be switched off at all: it used `z.coerce.boolean()`, i.e. `Boolean(value)`, so the _string_ `"false"` parsed as true. Both env booleans now go through `booleanFromEnv` in [configuration.ts](../../src/config/configuration.ts), which accepts true/false, 1/0, yes/no, on/off and refuses to boot on anything else.

## ADR-012: Import is an internal contour; Swagger and the AdminJS session are not public surface

**Decision:** `ImportController` carries a class-level `@InternalRoute()` and lives at `internal/import`. Swagger is mounted only when `NODE_ENV !== 'production'`. AdminJS registers its session with `saveUninitialized: false`.
**Why:** All three were public by accident rather than by choice. The import controller had no scope decorator, so it fell into the default `client` contour — reachable with the widget's public key, meaning any site visitor could trigger a full catalogue rewrite and drive traffic at the venus API. Swagger and AdminJS are both registered straight onto the raw Fastify instance, so neither passes through `AccessKeyGuard`: Swagger published the whole API map including the internal contour, and `@fastify/session` (default `saveUninitialized: true`) minted and stored a session for _every_ anonymous request to any route — answering `/v1/health` with `set-cookie: adminjs=…` and growing the in-memory store without bound until the process restarted.
The decorator goes on the class, not on each of the five handlers, so a handler added later inherits the internal contour instead of silently landing in the client one.
**Where:** [import.controller.ts](../../src/modules/catalog-import/controllers/import.controller.ts), [main.ts](../../src/main.ts), [admin.module.ts](../../src/modules/admin/admin.module.ts). Covered by [import-access.spec.ts](../../src/modules/catalog-import/tests/import-access.spec.ts).
**Consequences:** Import paths moved from `/v1/v1/import/*` to `/v1/internal/import/*` and now require `x-internal-api-key`. `/v1/docs` is gone in production — read the API from the DTOs and controllers. Anything mounted on the raw Fastify instance stays outside the guard, so a new registration there must bring its own access control.

## ADR-011: Product attributes — JSONB on products + reference table

**Decision:** Store attribute values per-product as `attributes: jsonb` on `products` table; maintain `product_attributes` as a reference/dictionary table per rn.
**Why:** Venus API `/v1/attributes/PRODUCT` returns display-label badges (name + group), not typed key-value pairs. JSONB on `products` is flexible for RAG and avoids a join table. GIN index on `products.attributes` allows containment queries. Reference table (`product_attributes`) provides discoverability and admin visibility of all available attributes per rn.
**Consequences:** `AttributeImportService` imports the dictionary via `POST /v1/import/attributes`. `ProductNormalizerService` extracts `raw.attributes[]` into `{ id, name }[]` and stores on `products.attributes`. `SearchableTextBuilderService` appends `Атрибуты: <names>` to searchable text and includes `attributes` in chunk metadata. `HybridRetrieverService.computeScore()` adds `+10` per matching attribute name from `filters.attributeNames`.
**Where:** [product-attributes.ts](../../src/database/schema/product-attributes.ts), [attribute-import.service.ts](../../src/modules/catalog-import/services/attribute-import.service.ts), [searchable-text-builder.service.ts](../../src/modules/rag/services/searchable-text-builder.service.ts)

## ADR-010: Categories are global per (rn, target); deduped by slug across cities

**Decision:** `CategoryImportService` iterates all active city slugs but writes only one `categories` row per `(rn, target, slug)`, regardless of how many cities return the same category.
**Why:** The venus API returns the same category catalog for every city slug — storing per-city would create duplicate rows with identical slugs. The unique constraint `categories_rn_target_slug_uniq` enforces this at DB level.
**Consequences:** The `br` column is set to the first city's `br` that returned the category (arbitrary). Soft-retire (`isActive=false`) when a slug disappears — never hard-delete. Skip deactivation when the entire fetch returns 0 categories (safety guard against accidental wipe).
**Where:** [category-import.service.ts](../../src/modules/catalog-import/services/category-import.service.ts), [categories.ts](../../src/database/schema/categories.ts)

## ADR-009: `ProductNormalizerService` extracted for venus API field mapping

**Decision:** All venus API → DB field mapping lives in `ProductNormalizerService.normalize()`, separate from `ProductImportService`.
**Why:** Venus API response shape is nested: localization arrays, classifiers array, `additionalProperties.nutritional`. Centralising mapping makes it unit-testable and decouples field resolution from import orchestration. Key gotcha: `raw.id` carries a target suffix (e.g. `<guid>-WEB`) that breaks the `uuid` column — use `raw.productId ?? raw.id` for `externalProductId`.
**Consequences:** `categoryName` resolved from `classifiers[]` matching `mainCategotyId` (note: API typo preserved). `name` / `description` prefer the `ru` localization entry, fall back to top-level field. All nutritional data (`weight`, `calories`, `protein`, `fat`, `carbs`) stored as `text` (not numeric).
**Where:** [product-normalizer.service.ts](../../src/modules/catalog-import/services/product-normalizer.service.ts), spec [004-fix-import-field-mapping](../../specs/004-fix-import-field-mapping/)

## ADR-001: Two separate LLM abstractions

**Decision:** Keep `LlmClient` (transport) and `LLMProvider` (domain) as distinct layers; do not merge.
**Why:** `LlmClient` ([common/llm/llm-client.interface.ts](../../src/common/llm/llm-client.interface.ts)) is a thin wrapper over the OpenAI SDK — chatCompletion/stream/embeddings/balance, maps SDK errors to `LlmClientError`. `LLMProvider` ([modules/assistant/providers/llm.provider.interface.ts](../../src/modules/assistant/providers/llm.provider.interface.ts)) speaks domain: `parseIntent` / `rerankAndAnswer`, owns prompt building + response parsing. Splitting keeps transport swappable (any OpenAI-compatible endpoint) independent of domain prompt logic, and lets tests mock at either layer.
**Consequences:** Two mock/openai switches (`LLM_PROVIDER` for domain, and the single transport impl). Don't call the SDK from domain code; go through `LlmClient`.

## ADR-002: AITunnel as the OpenAI base URL

**Decision:** `OPENAI_BASE_URL` defaults to `https://api.aitunnel.ru/v1/`; the only `LlmClient` impl is `AitunnelOpenAIClientService`.
**Why:** AITunnel is an OpenAI-compatible proxy (access/billing/region). Uses the standard OpenAI SDK, just repointed.
**Consequences:** `OPENAI_API_KEY` is the AITunnel key. Model ids come from AITunnel's catalog (`LLM_MODEL` default `gpt-4o-mini`, `EMBEDDING_MODEL` default `text-embedding-3-small`).

## ADR-003: Products keyed by (rn, br, target)

**Decision:** Thread `rn` (retail network), `br` (branch/city), `target` (`WEB`|`APP`|...) through service signatures; `DEFAULT_RN` in config.
**Why:** Same product differs by network, city, and client surface — availability, price, validity are per `city_products` row, not per `products` row. Card hydration always re-queries `city_products ⋈ products` for authoritative price/name/image.
**Consequences:** Nearly every catalog/retrieval/validation call carries the triple. Missing any → wrong or empty results. See [glossary.md](glossary.md).

## ADR-004: Hybrid retrieval — parallel vector + keyword, weighted score

**Decision:** Run pgvector cosine search and keyword search **in parallel**, merge/dedupe by `product_id`, score
`semantic*0.35 + keyword*0.2 + slotMatch*0.25 + 0.1`, cap 1. Shortlist ~30.
**Why:** Semantic catches paraphrase/intent; keyword catches exact names/rare tokens embeddings miss. Slot bonuses (category +20, ingredient +15 cap 40, non-spicy +10) inject structured intent. `+0.1` because everything is pre-filtered to available. Each search `.catch(() => [])` so one failing engine degrades gracefully.
**Where:** [hybrid-retriever.service.ts:111-144](../../src/modules/rag/services/hybrid-retriever.service.ts#L111).
**Consequences:** Weights are hand-tuned magic numbers — change deliberately. Empty candidate map → fallback to all city products (score 0.5).

## ADR-005: Always answer — never HTTP-error the pipeline

**Decision:** Every failure branch in the orchestrator returns a `FallbackService` response, not an exception to the client.
**Why:** Product UX requires the assistant to always say _something_ useful (clarify, generic list, or apology), even on LLM timeout, empty retrieval, invalid LLM output, or unexpected error.
**Where:** `assistant-orchestrator.service.ts` — `forUnsupportedIntent` / `forEmptyResult` / `forSuggestionEmpty` / `forLLMTimeout` / `forInvalidResponse`. Logging is best-effort (try/catch, never throws).
**Consequences:** Don't add throwing paths to `handle()`. Diagnose failures via `ai_logs.validation_status` + `fallback_used`, not HTTP 5xx.

## ADR-006: Mock-by-default providers for local dev

**Decision:** `LLM_PROVIDER`, `EMBEDDING_PROVIDER`, `CATALOG_API_MODE` all default to `mock`.
**Why:** Boot and run the whole app with **no API key** and no external venus dependency. Config validation only requires `OPENAI_API_KEY` when a provider is set to `openai` ([configuration.ts:49-56](../../src/config/configuration.ts#L49)).
**Consequences:** Mock embeddings are a deterministic hash ([mock-embedding.provider.ts](../../src/modules/rag/providers/mock-embedding.provider.ts)) — **no real semantics**. Vector search results are meaningless under mock; switch `EMBEDDING_PROVIDER=openai` for real retrieval quality.

## ADR-007: pgvector required; Windows native needs a compiled build

**Decision:** All Postgres access needs the pgvector extension. Docker path uses `pgvector/pgvector:pg16`.
**Why / native gotcha:** On this dev machine (native PostgreSQL 18, no docker), pgvector isn't bundled — compiled v0.8.3 from source (v0.8.0 fails on PG18: `vacuum_delay_point(bool)` signature change). See `../../.claude/memory/local-run-without-docker.md`.
**Consequences:** Don't use vanilla Postgres. `product_embeddings.embedding` is `vector(1536)`; changing embedding model dimensions requires a schema/migration change.

## ADR-008: Spec-kit driven workflow

**Decision:** Features go through GitHub Spec-Kit (`/speckit-specify → clarify → plan → tasks → analyze → implement`); artifacts in `specs/<NNN-short-name>/`, principles in `.specify/memory/constitution.md`.
**Why:** Spec-first keeps design decisions reviewable before code.
**Consequences:** For any non-trivial change, create/extend a spec under `specs/` rather than coding straight away. Trivial docs/lookups may skip.

## ADR-009: Массовая индексация RAG — свой скрипт, логика в `src/`

**Decision:** Массовый индексатор живёт в `RagBulkIndexerService` ([bulk-indexer.service.ts](../../src/modules/rag/services/bulk-indexer.service.ts)) внутри модуля RAG; `scripts/rag-index-all.ts` — тонкая CLI-обёртка (argv, сборка сервисов, печать, коды возврата). Разбор аргументов — чистые функции в [bulk-index-options.ts](../../src/modules/rag/bulk-index-options.ts).
**Why:** `vitest.config.ts` включает только `src/**/*.spec.ts` и `test/**/*.test.ts` — код в `scripts/` вне тестов. Вынос сути в `src/` делает обход, ретраи и правило пропуска покрываемыми и оставляет возможность дёрнуть индексатор из админ-эндпоинта. Спека: [009-rag-bulk-index](../../specs/009-rag-bulk-index/spec.md).
**Consequences:** В `scripts/rag-index-all.ts` не добавлять бизнес-логику. Скрипт работает вне Nest-контейнера (tsx не эмитит метаданные декораторов), сервисы собираются руками, как в `seeds/` и `rag-index-product.ts`.

## ADR-010: Правило «уже проиндексировано» — хэш + модель + статус

**Decision:** Позиция пропускается только если `product_embeddings.content_hash` равен MD5 текущего searchable-text, `product_embeddings.model_name` равен `provider.modelName()`, и `product_chunks.embedding_status = 'ready'`. Флаг `--force` отключает правило.
**Why:** Одного `product_chunks.content_hash` мало: `upsertChunk` при совпавшем хэше возвращает существующий чанк, **не трогая** `embedding_status`, поэтому чанк с актуальным текстом может быть `failed` или вовсе без вектора. Сверка `model_name` нужна, потому что векторы разных моделей несравнимы — при смене `EMBEDDING_MODEL` каталог обязан переиндексироваться целиком.
**Where:** `RagBulkIndexerService.isUpToDate`.
**Consequences:** Холостой повторный прогон не делает ни одного обращения к поставщику векторов (проверено: 20 879 позиций → 0 обработано, 20 879 пропущено).

## ADR-011: Пакетные эмбеддинги и дедупликация ключа чанка

**Decision:** Векторы запрашиваются пачками через `EmbeddingProvider.embedBatch` (новый `EmbeddingService.buildForChunks`, по умолчанию 32 текста, до 3 пачек одновременно). Ошибка провайдера на пачке → повтор с backoff `1s → 2s → 4s` (только для сетевых/5xx/429), после исчерпания попыток пачка разбирается по одной позиции. Неретраибельная ошибка (401 и подобные) валит пачку сразу. Кандидаты дедуплицируются по `(product_id, br, target)` в пределах прогона.
**Why:** 10 000 позиций — это ~313 HTTP-запросов вместо 10 000. Дедупликация нужна потому, что чанк ключуется тройкой `(product_id, br, target)` **без `rn`**, у `product_chunks` нет уникального ограничения, а `upsertChunk` работает по схеме select-then-insert — две строки каталога с разными `rn` и одинаковыми `br/target/product_id` в параллельных пачках дали бы дубль чанка.
**Consequences:** `EmbeddingService.buildForChunks` бросает исключение при отказе провайдера (чтобы вызывающий мог повторить) и возвращает `failed` для проблем уровня позиции (нет чанка, неверная размерность). Одиночный `buildForChunk` сохранил прежнее поведение — глушит ошибку и ставит `failed`.

## ADR-012: Категория из слота резолвится через справочник `categories`, фильтр — множественный

**Decision:** Название категории из слота интента (или payload пресета) не сравнивается с `products.category_id` напрямую. `CategoryResolverService` ([category-resolver.service.ts](../../src/modules/catalog/services/category-resolver.service.ts)) по (rn, target) читает `categories` и отдаёт для каждой совпавшей категории `category_id` справочника, `slug` и **отображаемое имя**. `CatalogFilters.categoryId: string` заменён на пару `categoryIds: string[]` + `categoryNames: string[]`; товар проходит фильтр, если совпал `products.category_id` **или** (без учёта регистра) `products.category_name`. Непопадание в справочник → фильтр по категории **не применяется** (а не пустая выдача). Список категорий для LLM берётся из того же справочника, исторические слаги `roll/set/drink/sauce/dessert/hot` раскрываются таблицей синонимов.
**Why:** При `CATALOG_API_MODE=real` в `products.category_id` лежит id категории поставщика (venus), а слот несёт канонический слаг — совпадений не бывает никогда, и любой вопрос с категорией на проде возвращал «Не нашёл подходящих товаров (из категории roll)» при полном каталоге. На сид-данных дефект невидим: там `category_id` равен слагу. Спека: [010-fix-category-filter](../../specs/010-fix-category-filter/spec.md).
**Where:** резолв вызывается в `ShortlistBuilderService.buildWithContext`, `SuggestionService.checkProductsExist` (иначе пресеты с категорией скрываются при наличии товаров) и `IntentSlotParserService.parse`; бонус скоринга в `HybridRetrieverService.computeScore` считает попадание и по id, и по имени.
**Форма данных на проде (проверено 2026-10-01, rn=A79C5050…):** `products.category_id` — это id **подкатегории** из `/v1/products`, а `categories.category_id` — id верхнего уровня из `/v1/init`, и они не совпадают. У «Роллы и суши» четыре разных id у товаров против одного в справочнике; у «Сеты» id совпал случайно. Единственная надёжная связка — `lower(products.category_name) = lower(categories.name)`: даёт 78 роллов, 85 сетов. Поэтому фильтр сопоставляет по имени, а id оставлен для сид/mock-каталогов, где имя может быть пустым.
**Consequences:** Справочник кэшируется в памяти на 5 минут — после импорта категорий изменения видны с задержкой до 5 минут. Сопоставление двухуровневое: точное/словоформенное, и только при пустом результате — подстрочное; добавление синонима это правка константы, а не логики. Любая ошибка чтения справочника = «категория не распознана», ассистент продолжает отвечать. Регрессия закреплена в [test/integration/category-filter.test.ts](../../test/integration/category-filter.test.ts) — на старой логике он падает.
