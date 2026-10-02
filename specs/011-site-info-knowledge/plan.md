# Implementation Plan: База знаний по информационным страницам сайта

**Branch**: `011-site-info-knowledge` | **Date**: 2026-10-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-site-info-knowledge/spec.md`

## Summary

Ассистент отвечает отказом на вопросы о доставке, оплате, бонусах, акциях, адресах и компании, хотя ответы опубликованы на информационных страницах сайта города. Сайт — клиентский Next.js без текста в HTML, поэтому страницы рендерятся headless-браузером офлайн-CLI (`pnpm site:crawl`) в снимок JSON в репозитории; второй CLI (`pnpm site:import`) загружает снимок в новые таблицы `site_pages` / `site_page_chunks` / `site_page_embeddings`, режет текст по заголовкам и строит эмбеддинги тем же поставщиком, что для товаров. В пайплайне ассистента появляется намерение `info_question`: гибридный поиск по чанкам города → `LLMProvider.answerFromKnowledge` с жёстким заземлением на фрагменты → ответ со ссылкой на страницу-источник, без карточек. Все сбои деградируют в fallback (ADR-005).

## Technical Context

**Language/Version**: TypeScript 5.x, Node >= 22 (локально 26.7, образ node:22-alpine)

**Primary Dependencies**: NestJS 10 + Fastify, Drizzle ORM 0.38, pgvector, OpenAI SDK через AITunnel; **новые**: `puppeteer-core` (управление системным браузером, без загрузки Chromium), `cheerio` (разбор снятого HTML в Node)

**Storage**: PostgreSQL 16 (prod) / 18 (dev native) + pgvector; три новые таблицы, одна миграция через `pnpm db:generate`; общий `customType vector` вынесен в `src/database/schema/vector.ts`

**Testing**: Vitest — юнит `src/**/*.spec.ts`, интеграционные `test/**/*.test.ts` (без БД, через фейки, как `category-filter.test.ts`); HTML-фикстуры из реальных отрисованных страниц Тюмени

**Target Platform**: Linux-контейнер (compose) для приложения и импорта; рабочая станция с Edge/Chrome для сбора

**Project Type**: модульный монолит + два CLI в `scripts/`

**Performance Goals**: ответ на `info_question` — то же число обращений к модели, что у товарного пути (parseIntent + 1), не более +20% латентности (SC-005); повторный импорт неизменённого снимка — 0 обращений к поставщику векторов (SC-004)

**Constraints**: сайт отвечает 25–170 с на страницу, ответы обрываются — таймаут страницы 180 с, параллельность 2, неудача страницы не валит прогон; на проде нет браузера и `src/` — импорт работает из снимка в одноразовом контейнере как `rag:index-all`; `BANNED_TOPICS` валидатора не применяются к сервисным ответам

**Scale/Scope**: ~10–30 страниц и ~50–150 чанков на город; затрагиваются модули `site-knowledge` (новый), `assistant`, `common/llm`, `database/schema`, `scripts/`, `data/`

## Constitution Check

`.specify/memory/constitution.md` не заполнен (шаблон). Гейты — конвенции `CLAUDE.md` и ADR:

| Гейт | Статус |
|------|--------|
| БД только через `@Inject(DATABASE_TOKEN)`, схема в `src/database/schema`, миграции через `db:generate` | PASS — новые таблицы в схеме, миграция генерируется |
| Env только через Zod `configuration.ts` | PASS для приложения — новых env у приложения нет; CLI сбора читает `BROWSER_EXECUTABLE_PATH` напрямую, как `rag:index-all` читает `EMBEDDING_PROVIDER` через shim (ADR-009) |
| Эндпоинт всегда отвечает (ADR-005) | PASS — `empty` → прежний отказ, `timeout` → выжимка фрагмента, ошибки поиска → `[]` |
| Два LLM-слоя не смешивать (ADR-001) | PASS — новый метод на `LLMProvider`, промпт/парсер в `common/llm`, транспорт не трогаем |
| Логика CLI живёт в `src/`, скрипт — обёртка (ADR-009) | PASS — `scripts/site-crawl.ts`, `scripts/site-import.ts` только argv/сборка/печать |
| Mock-by-default (ADR-006) | PASS — `MockLLMProvider.answerFromKnowledge`, `MockEmbeddingProvider` работают офлайн |
| Правило «уже проиндексировано» = hash + model + status (ADR-010) | PASS — повторено для страниц |
| Тесты рядом с модулем | PASS |

Нарушений нет; Complexity Tracking не заполняется. Новые зависимости обоснованы в [research.md R6](./research.md#r6-зависимости).

## Project Structure

### Documentation (this feature)

```text
specs/011-site-info-knowledge/
├── plan.md
├── spec.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── cli-site-crawl.md
│   ├── cli-site-import.md
│   └── info-answer.md
├── checklists/requirements.md
└── tasks.md                      # /speckit-tasks
```

### Source Code (repository root)

```text
data/site-pages/
└── tyumen.json                                   # НОВЫЙ снимок (FR-019)

scripts/
├── site-crawl.ts                                 # НОВЫЙ CLI: argv → SiteCrawlerService → снимок
└── site-import.ts                                # НОВЫЙ CLI: снимок → SitePageImportService

src/database/schema/
├── vector.ts                                     # НОВЫЙ общий customType vector
├── product-embeddings.ts                         # импортирует vector из vector.ts
├── site-pages.ts                                 # НОВЫЙ
├── site-page-chunks.ts                           # НОВЫЙ
├── site-page-embeddings.ts                       # НОВЫЙ
└── index.ts                                      # + экспорт
src/database/migrations/0007_*.sql                # сгенерирована

src/modules/site-knowledge/                       # НОВЫЙ модуль
├── site-knowledge.module.ts                      # imports RagModule (EMBEDDING_PROVIDER_TOKEN), exports InfoAnswerService
├── cli-options.ts                                # parseCrawlArgs / parseImportArgs / help / exit codes (чистые функции)
├── snapshot.ts                                   # типы CrawlSnapshot*, readSnapshot + валидация, DEFAULT_INFO_PAGES
├── crawler/
│   ├── page-fetcher.interface.ts                 # PageFetcher { fetch(url): Promise<{ html, title }> }
│   ├── headless-browser.fetcher.ts               # puppeteer-core + поиск исполняемого файла браузера
│   ├── html-text-extractor.ts                    # cheerio: выбор контентного корня, чистка, markdown-подобный текст
│   └── site-crawler.service.ts                   # обход списка страниц + ссылки акций, сборка снимка
├── services/
│   ├── page-chunker.ts                           # нарезка по заголовкам (чистая функция)
│   ├── site-page-import.service.ts               # upsert страниц, правило пропуска, замена чанков
│   ├── site-page-indexer.service.ts              # embedBatch по 32, запись site_page_embeddings, статусы
│   └── site-knowledge-search.service.ts          # vector + tsvector, слияние, top-K
└── tests/
    ├── cli-options.spec.ts
    ├── snapshot.spec.ts
    ├── html-text-extractor.spec.ts               # фикстуры: tests/fixtures/*.html (обрезанные реальные DOM)
    ├── page-chunker.spec.ts
    ├── site-crawler.spec.ts                      # обход, ссылки акций, failed-страницы, concurrency
    ├── site-page-indexer.spec.ts                 # пачки, статусы, ретраи
    ├── site-page-import.spec.ts                  # фейковая БД: insert/update/skip/force/dry-run/ignored
    └── site-knowledge-search.spec.ts             # слияние и нормировка score, деградация веток

src/common/llm/
├── llm-prompts.ts                                # INTENT_VALUES += info_question; buildKnowledgeAnswerMessages
└── llm-response.parser.ts                        # parseKnowledgeAnswerResponse

src/modules/assistant/
├── assistant.module.ts                           # imports SiteKnowledgeModule
├── providers/
│   ├── llm.provider.interface.ts                 # KnowledgeAnswer* типы, answerFromKnowledge
│   ├── mock-llm.provider.ts                      # intent-правила + mock answerFromKnowledge
│   └── openai-llm.provider.ts                    # answerFromKnowledge через LlmClient
├── services/
│   ├── assistant-orchestrator.service.ts         # ветка info_question до шортлиста, лог
│   ├── info-answer.service.ts                    # НОВЫЙ: поиск → LLM (race с LLM_TIMEOUT_MS) → InfoAnswerResult
│   ├── fallback.service.ts                       # forInfoTimeout(best), forInfoNotFound(source?)
│   └── response-validator.service.ts             # sanitizeFreeText()
└── tests/
    ├── mock-llm-intent.spec.ts                   # НОВЫЙ: сервисные/неподдерживаемые фразы
    ├── info-answer.spec.ts                       # НОВЫЙ: answer / not_found / empty / timeout
    ├── llm-response-parser.spec.ts               # НОВЫЙ: parseKnowledgeAnswerResponse
    ├── fallback.spec.ts                          # дополняется
    └── response-validator.spec.ts                # дополняется (sanitizeFreeText)

test/integration/
└── info-question.test.ts                         # оркестратор с фейками: info-ветка, регресс товарного пути

docs/knowledge/
├── modules.md                                    # + site-knowledge, CLI
├── decisions.md                                  # ADR: рендер браузером офлайн + снимок в репо; отдельные таблицы знаний
└── glossary.md                                   # info_question, снимок, фрагмент страницы
CLAUDE.md                                         # команды site:crawl / site:import
package.json                                      # scripts + deps
```

**Structure Decision**: знания сайта — отдельный модуль `site-knowledge`, а не часть `rag/`: другой источник, другие таблицы, свой CLI; `rag/` остаётся товарным. Модуль импортирует `RagModule` ради `EMBEDDING_PROVIDER_TOKEN` (общий поставщик векторов) и экспортирует `SiteKnowledgeSearchService`. `InfoAnswerService` живёт в `assistant/` (ему нужны `LLMProvider`, валидатор и fallback этого модуля), `AssistantModule` импортирует `SiteKnowledgeModule` — цикла нет. Краулер (`crawler/`) и индексатор лежат в `src/`, чтобы быть под тестами (ADR-009); `scripts/` — только обёртки.

## Ключевые решения реализации

1. **Рендер браузером, снимок в репозитории** — см. [research R1–R2](./research.md). `PageFetcher` — интерфейс; `HeadlessBrowserFetcher` реализует через `puppeteer-core` (`waitUntil: 'networkidle2'`, затем `waitForFunction` на непустой контентный корень, затем `outerHTML`). Экстрактор и чанкер тестируются на фикстурах без браузера.
2. **Экстракция текста** (`HtmlTextExtractor`): корень — первый из `.landing-page`, `.delivery-page`, `.about-page`, `[class*="promotions"]`, `main`, иначе `body`; удаляются `header, footer, nav, script, style, noscript, svg, button, form, input, [class*="cookie"], [class*="breadcrumb"], [class*="sidenav"], [class*="drawer"]`; `h1–h4` → `#…`, `li` → `- `, остальное — абзацы; схлопывание пробелов, удаление пустых и повторяющихся подряд строк; результат короче 200 символов → страница `failed: empty content`.
3. **Чанкер** — [research R4](./research.md#r4-нарезка-на-фрагменты): лимит 1200 символов, минимальный хвост 80, заголовочный путь в тексте чанка.
4. **Импорт** — транзакционно на страницу: при изменении hash удаляются старые чанки (каскад на эмбеддинги) и вставляются новые со статусом `pending`, затем индексатор переводит их в `ready`/`failed`. Правило пропуска — hash + все чанки `ready` + `model_name` совпадает ([data-model → переходы](./data-model.md#переходы-состояний)).
5. **Индексатор** — пачки по 32 через `embedBatch`; одна повторная попытка с паузой 2 с на ретраибельных ошибках (та же эвристика статусов/сообщений, что в `RagBulkIndexerService.isRetryable`); неретраибельная — пачка `failed`.
6. **Поиск** — `0.7*semantic + 0.3*keywordNorm`, top-6, обе ветки `.catch(() => [])` ([contracts/info-answer.md §3](./contracts/info-answer.md)). Веса — константы модуля, подбираются по набору вопросов quickstart.
7. **Ветка оркестратора** — `intent === 'info_question'` обрабатывается сразу после определения намерения и до предвыборки товаров; вопрос = `userMessage ?? retrieval_query`; `empty` → `forUnsupportedIntent()` (как сейчас), `timeout` → `forInfoTimeout(best)`, `not_found` → текст модели + ссылка на лучший фрагмент; `cards: []`, `actions: [{type:'open_url', url, title}]`. Лог: `validation_status` ∈ `info_*`, источники в `llm_response`.
8. **Валидация сервисного текста** — только `ALLERGY_SAFETY_PATTERNS` + обрезка 1200 символов (`sanitizeFreeText`); `BANNED_TOPICS` намеренно не применяются (они описывают именно эти темы).
9. **Промпт парсера намерений** — `info_question` добавляется с перечнем тем, `unsupported` сужается; `MockLLMProvider` — проверка «статус/мой заказ» раньше сервисных ключей, чтобы «где мой заказ» остался `unsupported`.
10. **Пресеты** — без изменений кода: `payload.intent = 'info_question'`, `check_products_exist = false`.

## Риски

| Риск | Смягчение |
|------|-----------|
| Сайт/браузер не успевают за 180 с, страница `failed` | таймаут и параллельность настраиваемы; прогон не падает; снимок хранит прежнюю версию в БД (failed-страницы при импорте игнорируются) |
| Селекторы контентного корня изменятся при редизайне сайта | fallback на `body` с вырезанием шапки/подвала; порог 200 символов ловит пустые страницы; фикстуры фиксируют текущую вёрстку |
| Модель «додумывает» цены/сроки | промпт с `not_found`, `used_passage_ids`; ссылка на источник в каждом ответе; ручная проверка набора вопросов (SC-002) |
| Слова «доставка/оплата» в ответе ломают существующий валидатор | сервисный текст идёт через `sanitizeFreeText`, не через `validate()` |
| `puppeteer-core` в прод-зависимостях | не загружается приложением, Chromium не скачивается; при желании позже перенести в devDependencies вместе с `tsx`-скриптами |
| В локальной БД нет города Тюмени для сквозной проверки | quickstart описывает загрузку снимка под `br` сид-города |
