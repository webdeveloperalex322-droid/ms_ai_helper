# Research: База знаний по информационным страницам сайта

**Date**: 2026-10-02 | **Spec**: [spec.md](./spec.md)

Обследование сайта `https://tyumen.sushi-master.ru/` выполнено 2026-10-01/02 (curl, разбор бандла Next.js, headless Edge). Ниже — факты и принятые на их основе решения.

## R1. Как получить текст страниц

**Факты**

- Сайт — Next.js (pages router, сборка `v2.0.9`), маршруты вида `/[city]/<page>`. Серверный HTML содержит только `<title>`, `<meta description>` и каркас; текст рисуется на клиенте. `__NEXT_DATA__` и `/_next/data/*` отсутствуют (страницы без `getServerSideProps`).
- Контент страниц берётся из трёх разных мест:
  - **бренд-чанки** (`public/brands/sm-ru/pages/{About,Bonus,LlmInfo,Franchise}/*Ru`) — React-компоненты с зашитым текстом, подгружаемые отдельными webpack-чанками (`1642.*.js`, `4357.*.js`, `1540.*.js`); текст внутри в виде `\uXXXX`-эскейпов;
  - **словари i18n** `/locales/ru/{common,seo,delivery,cart,checkout,product}.json` — заголовки, условия доставки, способы оплаты, типы заказов;
  - **venus-бэкенд** `https://venus-api-backend2.apps-web.net`: `/v1/init?rn&slug&target` (конфиг города, категории, контакты), `/v1/restaurants?rn&br&target` (рестораны, адреса, часы), `/v1/deliveryZones?rn&br` (зоны и время доставки). Акции (`.promotions` в redux-store) и юридические документы (`.content/.text`) через REST не найдены — вероятно, Firestore (`FIRESTORE_DB=PROD`, строка ошибки «Missing or insufficient permissions» в словаре). Пути `/v1/...` в бандле отсутствуют: клиент строит URL из констант `*_API` конфига.
- Сайт и venus-API отвечают медленно: 25–170 с на страницу, тела chunked-ответов периодически обрываются (`curl exit 18`, `IncompleteRead`).
- **Headless Edge** (`msedge --headless=new --dump-dom --virtual-time-budget=90000`) отрисовывает все целевые страницы с полным текстом: `/about`, `/bonus`, `/delivery`, `/promotions`, `/our-restourants`, `/llm-info`, `/public-oferta`, `/privacy`, `/personal-data-processing`, `/personal-data-transfer`. Загрузка часто завершается по таймауту (`Page load timed out`), но DOM к этому моменту уже заполнен.

**Decision**: единственный универсальный источник — рендер в headless Chromium-браузере. Краулер использует `puppeteer-core` и системный браузер (Edge/Chrome; путь через `--browser` или `BROWSER_EXECUTABLE_PATH`, с автопоиском типовых путей Windows/Linux/macOS). Ожидание: `networkidle2` → ожидание непустого контентного узла → снятие `outerHTML`. Таймаут страницы по умолчанию 180 с, 2 страницы параллельно.

**Rationale**: сборка текста из трёх разнородных источников (минифицированный JS, словари, REST) хрупка — ломается при любой пересборке сайта и не покрывает акции и документы. Браузер видит то же, что пользователь, и не зависит от внутреннего устройства сайта.

**Alternatives considered**: (а) парсинг бренд-чанков + словарей + REST — отвергнуто (неполно, хрупко); (б) полный `puppeteer` с загрузкой Chromium — отвергнуто (сотни МБ, не нужно: браузер есть на рабочей станции); (в) Playwright — отвергнуто, лишняя зависимость при равных возможностях.

**Follow-up (вне объёма)**: `/v1/deliveryZones` даёт время доставки по зонам — можно обогащать страницу «Доставка» таблицей зон; `/v1/restaurants` — машинный источник ресторанов. Оставлено как возможное улучшение.

## R2. Где и как исполнять сбор и загрузку

**Факты**

- Прод-образ (`Dockerfile`) ставит только `--prod` зависимости и не содержит `src/`, `scripts/`, `tsx`. Массовая индексация RAG на проде выполняется в одноразовом контейнере `node:22-alpine` на сети compose с `pnpm install` в режиме development (память проекта `prod-server-access`).
- Браузера на прод-сервере нет и ставить его там нежелательно.

**Decision**: два CLI в `scripts/`, логика — в `src/modules/site-knowledge/` (ADR-009):

- `pnpm site:crawl --url <site> --rn <rn> --br <br> --out data/site-pages/<city>.json` — рендерит страницы, пишет снимок JSON. Требует браузер. Запускается на рабочей станции.
- `pnpm site:import data/site-pages/<city>.json [--force] [--dry-run]` — читает снимок, upsert в `site_pages`, нарезка, эмбеддинги. Браузер не нужен; на проде запускается тем же способом, что `rag:index-all`.

Снимок хранится в репозитории (`data/site-pages/`), это даёт ревью текста глазами и перенос на прод через `git pull`.

**Alternatives considered**: внутренний HTTP-эндпоинт импорта `/v1/internal/site-pages/import` — отвергнут как лишняя поверхность (ADR-012): существующий механизм одноразового контейнера уже решает задачу; при необходимости добавить позже поверх того же сервиса.

## R3. Хранение и индексация

**Факты**

- Товарные чанки (`product_chunks`) имеют `product_id NOT NULL` с FK на `products`, `EmbeddingService.buildForChunks` жёстко привязан к `product_chunks/product_embeddings`. Тип `vector` объявлен локально в `product-embeddings.ts`.
- Правило «уже проиндексировано» для товаров: hash + model + status (ADR-010).

**Decision**: отдельные таблицы `site_pages` → `site_page_chunks` → `site_page_embeddings` (vector 1536). Общий `customType vector` выносится в `src/database/schema/vector.ts` и переиспользуется обеими таблицами эмбеддингов (миграция для товаров не меняется — тип тот же). Индексатор `SitePageIndexerService` работает напрямую через `EmbeddingProvider.embedBatch` пачками по 32 с одной попыткой повтора на сетевых ошибках; правило пропуска — то же (hash + model + status `ready`).

**Rationale**: объём — десятки чанков на город, тяжёлая машинерия bulk-индексатора (страницы, параллельные пачки, backoff) избыточна; обобщать `EmbeddingService` под два хранилища рискованно для рабочего товарного пути.

**Alternatives considered**: расширить `product_chunks` колонкой `source_type` и nullable `product_id` — отвергнуто: ломает инварианты товарного поиска (JOIN на `city_products`), засоряет товарную выборку.

## R4. Нарезка на фрагменты

**Decision**: текст страницы хранится в markdown-подобном виде (`#`-заголовки, `- ` списки, абзацы). Чанкер режет по заголовкам уровней 1–3; раздел длиннее 1200 символов делится по абзацам, хвосты короче 80 символов приклеиваются к предыдущему чанку. Текст чанка для индексации = `Заголовок страницы › Заголовок раздела` + тело. Детерминирован, покрыт юнит-тестами.

**Rationale**: страницы структурированы заголовками (условия доставки, способы оплаты, список ресторанов `##`-заголовками); юридические документы — длинные, их надо резать на разделы, иначе в контекст модели попадёт весь документ.

## R5. Ответ на вопрос о сервисе

**Факты**

- Промпт парсера намерений сейчас относит доставку/оплату/бонусы/промокоды к `unsupported`; `MockLLMProvider.detectIntent` — `доставк` → `unsupported`.
- `ResponseValidatorService.validateText` помечает слова «доставк», «оплат», «бонусн», «промокод» как `BANNED_TOPIC` — для сервисных ответов это неприменимо.

**Decision**:

- Новый intent `info_question` в `INTENT_VALUES` и в правилах промпта; `unsupported` сужается до вопросов о конкретном заказе/личном кабинете/не по теме. Mock-провайдер получает ключевые слова сервисных тем.
- Новый метод `LLMProvider.answerFromKnowledge({question, passages, maxPassages})` → `{answer_text, used_passage_ids, not_found, quick_replies}`; промпт требует отвечать только по переданным фрагментам, при отсутствии ответа ставить `not_found=true`.
- Поиск: `SiteKnowledgeSearchService` — векторный (`<=>`) и ключевой (`to_tsvector('russian')`) поиск по чанкам города, слияние по id чанка, `score = 0.7*semantic + 0.3*keyword_norm`, top-6; каждая ветка `.catch(() => [])`, как в гибридном ретривере.
- `InfoAnswerService` в модуле `site-knowledge` собирает ответ; таймаут через `Promise.race` с `LLM_TIMEOUT_MS`; текст проходит только проверку «медицинских гарантий» (`ALLERGY_SAFETY_PATTERNS`) — выделяется публичный метод `sanitizeFreeText` в `ResponseValidatorService`.
- Ответ: `reply_text`, `cards: []`, `actions: [{ type: 'open_url', url, title }]` с страницей-источником лучшего фрагмента, `quick_replies`.
- Оркестратор: ветка `info_question` сразу после определения намерения, до шортлиста; лог в `ai_logs` с `validation_status` ∈ {`info_answer`, `info_not_found`, `info_empty`, `info_timeout`}, использованные страницы — в `llm_response` (`{ kind: 'info', sources: [...] }`).

**Alternatives considered**: пропускать сервисный вопрос через существующий `rerankAndAnswer` с чанками вместо товаров — отвергнуто: контракт заточен под `product_id` и карточки, валидатор отбрасывает всё, что не товар.

## R6. Зависимости

| Пакет | Назначение | Где |
|-------|-----------|-----|
| `puppeteer-core` ^24 | управление системным браузером, без загрузки Chromium | `dependencies` (используется только CLI; в прод-образ попадает, но не загружается) |
| `cheerio` ^1 | разбор снятого HTML в Node (тестируемый экстрактор без браузера) | `dependencies` |

Проверено: `pnpm view puppeteer-core version` → 25.12.0 доступен; Node 26.7 локально, Node 22 в образе — поддерживается обоими.

## R7. Проверка на реальных данных

Снимок Тюмени: rn `A79C5050-1EE7-11EB-9B6E-05B5FC40DF2A`, br `E3AFD1AC-4D3D-EA11-A958-8B023DE8EF69` (из `/v1/init`, slug `tyumen`). В локальной БД города Тюмени может не быть (сид-данные) — для сквозной проверки ответа оркестратор требует активный город с товарами; quickstart описывает оба варианта: импорт реального каталога либо загрузка снимка под `br` сид-города.
