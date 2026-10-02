---
description: "Task list for 011-site-info-knowledge"
---

# Tasks: База знаний по информационным страницам сайта

**Input**: Design documents from `/specs/011-site-info-knowledge/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: включены (TDD). Краулер зависит от медленного внешнего сайта, поэтому экстрактор, чанкер, правило импорта, слияние поиска и ветка ответа фиксируются юнит-тестами на фикстурах до реализации — иначе регрессии ловятся только ручным прогоном.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: можно выполнять параллельно (разные файлы, нет зависимостей)
- **[Story]**: US1 (ответ на вопрос о сервисе), US2 (сбор и загрузка), US3 (пресеты)

## Path Conventions

Модульный монолит NestJS: исходники `src/modules/<module>/`, тесты рядом `src/modules/<module>/tests/*.spec.ts`, интеграционные `test/integration/*.test.ts`, CLI-обёртки `scripts/`, данные `data/site-pages/`.

**Порядок историй**: US2 (P1, наполнение базы) идёт раньше US1 (P1, ответ): без данных ответ проверить нельзя. Обе P1.

---

## Phase 1: Setup

**Purpose**: зависимости и каркас модуля.

- [X] T001 Убедиться, что дерево чистое и тесты зелёные до правок: `pnpm test`; создать ветку `011-site-info-knowledge`
- [X] T002 Добавить зависимости `puppeteer-core` и `cheerio` (`pnpm add puppeteer-core cheerio`), скрипты `site:crawl` → `tsx scripts/site-crawl.ts` и `site:import` → `tsx scripts/site-import.ts` в `package.json`
- [X] T003 [P] Создать каркас модуля `src/modules/site-knowledge/site-knowledge.module.ts` (imports `RagModule`, пустые providers/exports) и подключить в `src/app.module.ts`; создать каталоги `src/modules/site-knowledge/{crawler,services,tests,tests/fixtures}`, `data/site-pages/`

---

## Phase 2: Foundational

**Purpose**: схема БД, типы снимка, чанкер — на них стоят все истории.

**⚠️ CRITICAL**: без T004–T012 ни одна история не реализуема.

- [X] T004 Вынести `customType vector` в `src/database/schema/vector.ts` и переключить на него `src/database/schema/product-embeddings.ts` (SQL-тип не меняется)
- [X] T005 [P] Описать таблицу `site_pages` в `src/database/schema/site-pages.ts` по [data-model.md](./data-model.md): unique `(rn, br, url)`, index `(rn, br, is_active)`, типы `SitePage`/`NewSitePage`
- [X] T006 [P] Описать `site_page_chunks` в `src/database/schema/site-page-chunks.ts`: FK cascade на `site_pages`, unique `(page_id, chunk_index)`, index `(rn, br, embedding_status)`
- [X] T007 [P] Описать `site_page_embeddings` в `src/database/schema/site-page-embeddings.ts` с `vector(1536)` из `vector.ts`, FK cascade на чанк
- [X] T008 Экспортировать новые таблицы из `src/database/schema/index.ts`; сгенерировать миграцию `pnpm db:generate` (ожидание: только три `CREATE TABLE` + индексы, без изменений `product_embeddings`); применить `pnpm db:migrate`
- [X] T009 [P] Написать падающие тесты снимка в `src/modules/site-knowledge/tests/snapshot.spec.ts`: `readSnapshot` принимает валидный снимок, отвергает отсутствие `version/rn/br/pages`, дубликаты `url`, `status: ok` без `content`; `pageKeyFromPath('/')` → `home`, `/promotions/x` → `promotions/x`; `DEFAULT_INFO_PAGES` содержит 10 путей из [contracts/cli-site-crawl.md](./contracts/cli-site-crawl.md)
- [X] T010 Реализовать `src/modules/site-knowledge/snapshot.ts`: типы `CrawlSnapshot`, `CrawlSnapshotPage`, `DEFAULT_INFO_PAGES`, `pageKeyFromPath`, `readSnapshot(path)` с валидацией, `contentHash(text)` (md5)
- [X] T011 [P] Написать падающие тесты чанкера в `src/modules/site-knowledge/tests/page-chunker.spec.ts`: деление по `#`/`##`/`###`; раздел > 1200 символов делится по абзацам; хвост < 80 символов приклеивается к предыдущему; текст чанка начинается с `Заголовок страницы › путь заголовков`; индексы последовательны; пустой текст → `[]`; длинный документ без заголовков режется по абзацам
- [X] T012 Реализовать чистую функцию `chunkPage({ title, content }, { maxChars = 1200, minTail = 80 })` в `src/modules/site-knowledge/services/page-chunker.ts` → `PageChunkDraft[]`

**Checkpoint**: миграция применена, `snapshot.spec` и `page-chunker.spec` зелёные.

---

## Phase 3: User Story 2 — Сбор и загрузка знаний оператором (Priority: P1)

**Goal**: `pnpm site:crawl` даёт снимок Тюмени, `pnpm site:import` наполняет и индексирует базу, повтор — пропуск.

**Independent Test**: quickstart шаги 2–3: снимок с `ok ≥ 10`, импорт → все чанки `ready`, повторный импорт → все страницы `skipped`.

### Экстрактор и краулер

- [X] T013 [P] [US2] Положить фикстуры в `src/modules/site-knowledge/tests/fixtures/`: обрезанные реальные DOM Тюмени `delivery.html`, `restaurants.html`, `promotions.html`, `bonus.html`, `empty-shell.html` (каркас без контента; источник — snapshot headless Edge из обследования, вырезать `<script>`/`<style>`, оставить шапку/подвал для проверки чистки)
- [X] T014 [P] [US2] Написать падающие тесты `src/modules/site-knowledge/tests/html-text-extractor.spec.ts`: из `delivery.html` получаем `# Стоимость доставки…`, `## Как оплатить заказ?`, `### Наличными`, абзацы; из `restaurants.html` — `## СМ-Тюмень-06`, адрес и часы; текст шапки/подвала («Скачать приложение», «Все права защищены») и cookie-баннера отсутствует; пустые `- ` строки отсутствуют; `empty-shell.html` → текст короче 200 символов; `<title>` возвращается отдельно
- [X] T015 [US2] Реализовать `HtmlTextExtractor.extract(html): { title, content }` в `src/modules/site-knowledge/crawler/html-text-extractor.ts` на cheerio по решению 2 плана (выбор корня, список удаляемых селекторов, `h1–h4` → `#`, `li` → `- `, схлопывание, дедуп соседних строк)
- [X] T016 [P] [US2] Определить `PageFetcher` в `src/modules/site-knowledge/crawler/page-fetcher.interface.ts`: `fetch(url, { timeoutMs }): Promise<{ html: string; title: string; finalUrl: string }>`, `close()`
- [X] T017 [US2] Реализовать `HeadlessBrowserFetcher` в `src/modules/site-knowledge/crawler/headless-browser.fetcher.ts`: `puppeteer-core.launch({ executablePath, headless: true })`, `goto(waitUntil: 'networkidle2')` с перехватом таймаута (DOM всё равно снимается), `waitForFunction` на непустой контентный корень до `timeoutMs`, `outerHTML`; `resolveBrowserExecutable(explicit?)`: аргумент → `BROWSER_EXECUTABLE_PATH` → типовые пути Edge/Chrome на Windows, `google-chrome|chromium|chromium-browser` на Linux, Chrome на macOS; ошибка с подсказкой, если не найден
- [X] T018 [P] [US2] Написать падающие тесты `src/modules/site-knowledge/tests/site-crawler.spec.ts` с фейковым `PageFetcher`: обходит заданные пути, строит `CrawlSnapshot` с `rn/br/site_url`; ошибка fetch одной страницы → `status: failed` с `error`, остальные `ok`; текст < 200 символов → `failed: empty content`; со страницы `/promotions` собираются ссылки `/promotions/<slug>` (глубина 1, без дублей), флаг `noPromotionDetails` отключает; `concurrency` соблюдается (не более N одновременных fetch)
- [X] T019 [US2] Реализовать `SiteCrawlerService.crawl(options): Promise<CrawlSnapshot>` в `src/modules/site-knowledge/crawler/site-crawler.service.ts` (конструктор принимает `PageFetcher` и `HtmlTextExtractor`), прогресс через `onPage` колбэк
- [X] T020 [P] [US2] Написать падающие тесты `src/modules/site-knowledge/tests/cli-options.spec.ts`: `parseCrawlArgs` — обязательные `--url/--rn/--br/--out`, `--pages` через запятую, `--no-promotion-details`, `--browser`, `--page-timeout`, `--concurrency`, `--help`, ошибки на неизвестный флаг; `parseImportArgs` — позиционный путь, `--force`, `--dry-run`; константы кодов возврата `EXIT_OK=0, EXIT_ERROR=1, EXIT_NO_BROWSER=2, EXIT_PARTIAL=3`
- [X] T021 [US2] Реализовать `src/modules/site-knowledge/cli-options.ts` (чистые функции, `formatCrawlHelp`, `formatImportHelp`)
- [X] T022 [US2] Написать CLI `scripts/site-crawl.ts` по [contracts/cli-site-crawl.md](./contracts/cli-site-crawl.md): argv → `parseCrawlArgs`, браузер → `HeadlessBrowserFetcher`, `SiteCrawlerService.crawl`, запись снимка (`JSON.stringify(…, null, 2)`), таблица результатов, коды возврата; без бизнес-логики (ADR-009)

### Импорт и индексация

- [X] T023 [P] [US2] Написать падающие тесты `src/modules/site-knowledge/tests/site-page-indexer.spec.ts` с фейковой БД и фейковым `EmbeddingProvider`: пачки по 32 (`embedBatch` вызывается ⌈n/32⌉ раз), запись `site_page_embeddings` с `model_name` и `content_hash`, статус `ready`; неверная размерность → `failed` для чанка; ретраибельная ошибка (status 429) → одна повторная попытка и успех; неретраибельная (401) → вся пачка `failed` без повтора; возвращает `{ indexed, failed }`
- [X] T024 [US2] Реализовать `SitePageIndexerService.indexChunks(chunkIds)` в `src/modules/site-knowledge/services/site-page-indexer.service.ts` (`@Inject(DATABASE_TOKEN)`, `@Inject(EMBEDDING_PROVIDER_TOKEN)`), эвристика `isRetryable` как в `RagBulkIndexerService`, пауза 2 с (параметр для тестов)
- [X] T025 [P] [US2] Написать падающие тесты `src/modules/site-knowledge/tests/site-page-import.spec.ts` с фейковой БД (protected-методы доступа к данным переопределяются в тестовом подклассе, как в `bulk-indexer.service.spec.ts`): новая страница → `inserted` + чанки `pending` + вызов индексатора; hash совпал, все `ready`, модель та же → `skipped` без индексатора; hash совпал, есть `failed` чанк → переиндексация только эмбеддингов (`updated`, без пересоздания чанков); hash отличается → `updated`, старые чанки удалены, новые созданы; `force` → как изменение; `dryRun` → счётчики без записи и без индексатора; `status: failed` в снимке → `ignored`; ошибка индексатора на странице → `failed` с `error`, остальные страницы обрабатываются; отчёт `ImportReport` по контракту
- [X] T026 [US2] Реализовать `SitePageImportService.importSnapshot(snapshot, options)` в `src/modules/site-knowledge/services/site-page-import.service.ts` по [contracts/cli-site-import.md](./contracts/cli-site-import.md) и переходам [data-model.md](./data-model.md#переходы-состояний); транзакция `db.transaction` на страницу
- [X] T027 [US2] Зарегистрировать `SitePageIndexerService`, `SitePageImportService`, `HtmlTextExtractor` в `src/modules/site-knowledge/site-knowledge.module.ts`
- [X] T028 [US2] Написать CLI `scripts/site-import.ts` по контракту: `readSnapshot`, сборка сервисов вручную (как `scripts/rag-index-all.ts`: `drizzle` + `Pool`, провайдер по `EMBEDDING_PROVIDER`), отчёт, коды возврата
- [ ] T029 [US2] Собрать снимок Тюмени: `pnpm site:crawl --url https://tyumen.sushi-master.ru --rn A79C5050-1EE7-11EB-9B6E-05B5FC40DF2A --br E3AFD1AC-4D3D-EA11-A958-8B023DE8EF69 --out data/site-pages/tyumen.json`; проверить глазами по quickstart шаг 2; при `failed` — повторить прогон только для этих путей через `--pages` и слить вручную, либо увеличить `--page-timeout`
- [ ] T030 [US2] Загрузить снимок локально: `pnpm site:import data/site-pages/tyumen.json`, повтор → все `skipped`, `--dry-run` → без записи; проверить SQL из quickstart шаг 3

**Checkpoint**: база Тюмени заполнена, все чанки `ready`, повторный импорт не обращается к поставщику векторов (SC-003, SC-004).

---

## Phase 4: User Story 1 — Ответ на вопрос о сервисе (Priority: P1) 🎯 MVP

**Goal**: вопросы о доставке/оплате/бонусах/акциях/адресах получают ответ из базы знаний со ссылкой на источник; товарный путь не меняется.

**Independent Test**: quickstart шаг 4 — «как можно оплатить заказ» → способы оплаты и `actions[0].url` → `/delivery`; «подбери сет на двоих» → карточки как раньше; «где мой заказ 123» → прежний отказ.

### Намерение и контракт провайдера

- [X] T031 [P] [US1] Расширить `src/modules/assistant/providers/llm.provider.interface.ts`: типы `KnowledgePassageInput`, `KnowledgeAnswerInput`, `KnowledgeAnswerResult`, метод `answerFromKnowledge` в `LLMProvider` ([contracts/info-answer.md §2](./contracts/info-answer.md))
- [X] T032 [P] [US1] Написать падающие тесты `src/modules/assistant/tests/mock-llm-intent.spec.ts`: «сколько стоит доставка», «как оплатить», «какой кешбэк», «какие акции», «адрес ресторана», «до скольки работаете», «есть ли самовывоз» → `info_question`; «где мой заказ 123», «статус заказа» → `unsupported`; «подбери сет на двоих» → `product_recommendation`; `answerFromKnowledge` mock: первый фрагмент (≤ 300 символов) + «Подробнее на странице: <title>», `used_passage_ids=[first.id]`, при пустых passages `not_found=true`
- [X] T033 [US1] Обновить `src/modules/assistant/providers/mock-llm.provider.ts`: правила `detectIntent` (проверка заказа раньше сервисных ключей), реализация `answerFromKnowledge`
- [X] T034 [P] [US1] Написать падающие тесты парсера в `src/modules/assistant/tests/llm-response-parser.spec.ts` (новый файл, если нет): `parseKnowledgeAnswerResponse` фильтрует `used_passage_ids` по входным, подставляет текст по умолчанию при пустом `answer_text`, `not_found` → boolean, `quick_replies` только строки, снимает ```json-обёртку
- [X] T035 [US1] Дополнить `src/common/llm/llm-prompts.ts`: `INTENT_VALUES` += `info_question`, правила промпта парсера по контракту §1, `buildKnowledgeAnswerMessages(input)` (system с заземлением, JSON-формат ответа, фрагменты как `[id] title › heading\ntext`); `src/common/llm/llm-response.parser.ts`: `parseKnowledgeAnswerResponse`
- [X] T036 [US1] Реализовать `answerFromKnowledge` в `src/modules/assistant/providers/openai-llm.provider.ts` через `llmClient.chatCompletion` с `response_format: json_object`, логирование ошибок как у соседних методов

### Поиск и сервис ответа

- [X] T037 [P] [US1] Написать падающие тесты `src/modules/site-knowledge/tests/site-knowledge-search.spec.ts` (protected-методы `vectorSearch`/`keywordSearch` переопределяются): слияние по `chunkId`, `score = 0.7*semantic + 0.3*keywordNorm`, нормировка ключевого score на максимум, сортировка и `topK`; одна ветка бросает → результат из другой; обе пустые → `[]`; `embedQuery` вызывается один раз
- [X] T038 [US1] Реализовать `SiteKnowledgeSearchService.search` в `src/modules/site-knowledge/services/site-knowledge-search.service.ts`: SQL векторной и ключевой веток по [contracts/info-answer.md §3](./contracts/info-answer.md) (JOIN `site_pages.is_active`, `embedding_status='ready'`, `rn`, `br`), `to_tsquery('russian', 'w:* & …')` с fallback `[]`
- [X] T039 [P] [US1] Дополнить `src/modules/assistant/tests/response-validator.spec.ts`: `sanitizeFreeText` заменяет «100% безопасно» на «уточните состав у ресторана», НЕ трогает слова «доставка», «оплата», «бонусы», обрезает до 1200 символов
- [X] T040 [US1] Добавить публичный `sanitizeFreeText(text)` в `src/modules/assistant/services/response-validator.service.ts`
- [X] T041 [P] [US1] Дополнить `src/modules/assistant/tests/fallback.spec.ts`: `forInfoTimeout(best)` — первые 400 символов текста фрагмента + «Подробнее: <title>», `actions=[{type:'open_url', url, title}]`, `cards=[]`, `fallback_used=true`; `forInfoNotFound(source?)` — текст «На сайте нет такой информации…», ссылка при наличии источника
- [X] T042 [US1] Реализовать `forInfoTimeout`, `forInfoNotFound` в `src/modules/assistant/services/fallback.service.ts`
- [X] T043 [P] [US1] Написать падающие тесты `src/modules/assistant/tests/info-answer.spec.ts` с фейковыми `SiteKnowledgeSearchService`, `LLMProvider`, `ResponseValidatorService`, `FallbackService`, `ConfigService`: поиск пуст → `kind: 'empty'`; ответ модели → `kind: 'answer'`, `source` = страница первого `used_passage_ids`, `sources` без дублей, текст прошёл `sanitizeFreeText`; `not_found: true` → `kind: 'not_found'`, `source` = лучший по score; модель не ответила за `LLM_TIMEOUT_MS` → `kind: 'timeout'`, `reply_text` из лучшего фрагмента; модель бросила → `timeout`
- [X] T044 [US1] Реализовать `InfoAnswerService.answer(request)` в `src/modules/assistant/services/info-answer.service.ts` по [contracts/info-answer.md §4](./contracts/info-answer.md); `Promise.race` с `LLM_TIMEOUT_MS`; зависимости через DI: `SiteKnowledgeSearchService` (из `SiteKnowledgeModule`), `LLM_PROVIDER_TOKEN`, `ResponseValidatorService`, `FallbackService`, `ConfigService`; `SiteKnowledgeModule` экспортирует только `SiteKnowledgeSearchService` (цикла модулей нет)

### Оркестратор

- [X] T045 [P] [US1] Написать падающий интеграционный тест `test/integration/info-question.test.ts`: оркестратор с фейковой БД (город активен, товаров > 0, `insert(aiLogs)` перехватывается), фейковыми `IntentSlotParserService` (возвращает `info_question`), `InfoAnswerService`, `ShortlistBuilderService` (должен НЕ вызываться): ответ содержит `reply_text`, `cards: []`, `actions[0].type === 'open_url'`; лог `intent='info_question'`, `validation_status='info_answer'`, `llm_response.sources`; `kind: 'empty'` → текст `forUnsupportedIntent`, `validation_status='info_empty'`, `fallback_used=true`; `kind: 'timeout'` → `info_timeout`; пресет с `payload.intent='info_question'` → вопрос берётся из `retrieval_query`; интент `product_recommendation` → `ShortlistBuilderService` вызван (регресс)
- [X] T046 [US1] Реализовать ветку `info_question` в `src/modules/assistant/services/assistant-orchestrator.service.ts` сразу после определения намерения и до `buildWithContext`; `logRequest` расширить необязательным `llmResponse`; `AssistantResponse.actions` допускает `{ type: 'open_url', url, title }`
- [X] T047 [US1] Зарегистрировать `InfoAnswerService` в `src/modules/assistant/assistant.module.ts`, импортировать `SiteKnowledgeModule`; `pnpm build` проходит
- [ ] T048 [US1] Ручная проверка по quickstart шаг 4 с `LLM_PROVIDER=mock` и, при наличии ключа, `LLM_PROVIDER=openai`: набор из 20 вопросов, регресс товарного пути; зафиксировать результаты в `specs/011-site-info-knowledge/quickstart.md` (раздел «Результаты проверки»)

**Checkpoint**: MVP — сервисные вопросы отвечаются из базы знаний, товарные тесты зелёные (SC-001, SC-002, SC-006).

---

## Phase 5: User Story 3 — Готовые подсказки по сервисным темам (Priority: P3)

**Goal**: пресет с `intent: 'info_question'` даёт ответ из базы знаний.

**Independent Test**: создать пресет «Условия доставки» (`retrieval_query: 'условия доставки'`, `check_products_exist: false`), нажать → ответ со страницы `/delivery`.

- [ ] T049 [P] [US3] Добавить в `seeds/index.ts` два пресета для `DEFAULT_RN`: «Условия доставки» (`info_question`, `retrieval_query: 'условия доставки и способы оплаты'`) и «Бонусная программа» (`retrieval_query: 'бонусная программа кешбэк'`), `availability_rules.check_products_exist: false`, `fallback_payload` с текстом про сайт
- [ ] T050 [US3] Проверить, что `src/modules/suggestions/services/suggestion.service.ts` отдаёт такие пресеты без проверки товаров (`check_products_exist=false`) и `payload_preview.intent='info_question'`; при необходимости — только правка данных, не кода
- [ ] T051 [US3] Ручная проверка: `GET /v1/suggestions` содержит пресеты, `POST product-answer` с `suggestion_id` отвечает из базы знаний; при пустой базе — `fallback_payload`

---

## Phase 6: Polish & Cross-Cutting

- [ ] T052 [P] Обновить `CLAUDE.md`: команды `pnpm site:crawl`, `pnpm site:import`, упоминание `data/site-pages/`, замечание «без импорта снимка сервисные вопросы получают отказ»
- [ ] T053 [P] Обновить `docs/knowledge/modules.md` (модуль `site-knowledge`, CLI, таблицы), `docs/knowledge/glossary.md` (`info_question`, снимок, фрагмент страницы), `docs/knowledge/architecture.md` (ветка info в шаге 1–2 пайплайна)
- [ ] T054 [P] Добавить ADR в `docs/knowledge/decisions.md`: «ADR-014: знания сайта собираются рендером в браузере офлайн, снимок хранится в репозитории» и «ADR-015: отдельные таблицы знаний сайта, индексатор без обобщения EmbeddingService» (контекст, почему, последствия, где)
- [ ] T055 [P] Обновить `README.md`: раздел «База знаний сайта» (кратко, со ссылкой на quickstart)
- [ ] T056 `pnpm lint && pnpm format && pnpm test && pnpm build` — всё зелёное; закоммитить работу осмысленными коммитами (схема+миграция; краулер; импорт; ответ; снимок; документация)

---

## Dependencies & Execution Order

```
Phase 1 (T001–T003)
  → Phase 2 (T004–T012)             схема, снимок, чанкер
    → Phase 3 US2 (T013–T030)       краулер → импорт → данные Тюмени
      → Phase 4 US1 (T031–T048)     поиск и ответ (нужны данные для ручной проверки; код можно писать параллельно с T029–T030)
        → Phase 5 US3 (T049–T051)
          → Phase 6 (T052–T056)
```

- US1 код (T031–T047) не зависит от снимка — зависит от схемы (Phase 2) и `SiteKnowledgeSearchService`; только T048 требует T030.
- US3 — данные поверх US1.

## Parallel Execution Examples

- **Phase 2**: T005, T006, T007 (три файла схемы) параллельно; T009 и T011 (тесты) параллельно с ними.
- **US2**: T013/T014 (фикстуры и тесты экстрактора), T016 (интерфейс), T018 (тесты краулера), T020 (тесты CLI), T023 (тесты индексатора), T025 (тесты импорта) — все параллельно; реализации T015, T017, T019, T021, T024, T026 — после своих тестов.
- **US1**: T031, T032, T034, T037, T039, T041, T043, T045 — параллельно; реализации по порядку T033 → T035 → T036, T038, T040, T042, T044, T046, T047.
- **Polish**: T052–T055 параллельно.

## Implementation Strategy

1. **MVP = Phase 2 + US2 + US1** (T001–T048): база наполнена снимком Тюмени, ассистент отвечает на сервисные вопросы.
2. US3 — только данные сидов и проверка.
3. Документация и ADR — в конце, одним проходом.

## Notes

- `InfoAnswerService` размещён в `assistant/`, а не в `site-knowledge/`: ему нужны `LLMProvider`, `ResponseValidatorService` и `FallbackService` из модуля ассистента, а `SiteKnowledgeModule` отдаёт только поиск — так нет цикла модулей. plan.md приведён в соответствие.
