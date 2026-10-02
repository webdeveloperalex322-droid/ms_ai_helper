# Quickstart: база знаний сайта — проверка сквозного сценария

**Prerequisites**: Postgres с pgvector поднят, миграции применены (`pnpm db:migrate`), `.env` настроен. Для сбора — установлен Edge или Chrome.

## 1. Юнит- и интеграционные тесты

```bash
pnpm test
```

Ожидание: зелёные `src/modules/site-knowledge/tests/*.spec.ts`, `src/modules/assistant/tests/*.spec.ts`, `test/integration/info-question.test.ts`; товарные тесты без изменений (SC-006).

## 2. Сбор снимка Тюмени (нужен браузер)

```bash
pnpm site:crawl --url https://tyumen.sushi-master.ru \
  --rn A79C5050-1EE7-11EB-9B6E-05B5FC40DF2A \
  --br E3AFD1AC-4D3D-EA11-A958-8B023DE8EF69 \
  --out data/site-pages/tyumen.json
```

Сайт медленный: 2–4 минуты на страницу, весь прогон 10–20 минут. Ожидание: `ok=10+` (десять страниц по умолчанию плюс страницы акций), `failed=0` (SC-003). Если браузер не найден — `--browser "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"`.

Проверить снимок глазами: в `/delivery` есть способы оплаты, в `/our-restourants` — адреса и часы, в `/bonus` — проценты кешбэка, в `/promotions` — заголовки акций.

## 3. Загрузка в БД

```bash
pnpm site:import data/site-pages/tyumen.json
pnpm site:import data/site-pages/tyumen.json          # повтор: все страницы skipped (SC-004)
pnpm site:import data/site-pages/tyumen.json --dry-run
```

Проверка в БД:

```sql
select page_key, length(content), is_active from site_pages where br = 'E3AFD1AC-4D3D-EA11-A958-8B023DE8EF69';
select embedding_status, count(*) from site_page_chunks group by 1;   -- все ready
```

## 4. Ответ ассистента

Оркестратор требует активный город с товарами. Варианты:

- **реальный каталог**: `CATALOG_API_MODE=real`, импорт городов/товаров через `/v1/internal/import/*`, затем шаг 3 с настоящим `br` Тюмени;
- **сид-данные**: загрузить снимок под `br` сид-города (`--br <seed-br>` на шаге 2 или правка поля `br` в копии снимка), чтобы проверить путь ответа.

```bash
pnpm start:dev
curl -s -X POST http://localhost:3000/v1/assistant/product-answer \
  -H 'content-type: application/json' -H 'x-client-api-key: <key>' \
  -d '{"rn":"A79C5050-1EE7-11EB-9B6E-05B5FC40DF2A","br":"<br>","target":"WEB","user_message":"как можно оплатить заказ"}'
```

Ожидание (`LLM_PROVIDER=openai`): `reply_text` перечисляет наличные, карту онлайн, карту при получении; `cards: []`; `actions[0].url` оканчивается на `/delivery`. С `LLM_PROVIDER=mock` — `reply_text` начинается с текста фрагмента про оплату.

Ещё вопросы для набора SC-001/SC-002 (минимум 20): «сколько начисляется бонусов», «через сколько сгорают баллы», «какой процент заказа можно оплатить баллами», «какие акции сейчас», «есть ли скидка на самовывоз», «адрес ресторана на Республики», «до скольки работаете», «за сколько надо заказать к определённому времени», «принимаете карту МИР», «кто вы такие», «сколько у вас ресторанов», «как связаться с поддержкой», «можно ли оплатить криптовалютой» (ожидание: честное «нет такой информации»).

Регресс: «подбери сет на двоих до 1500» → карточки как раньше; «где мой заказ 123» → прежний отказ.

Журнал: `select intent, validation_status, fallback_used, llm_response from ai_logs order by created_at desc limit 5;` — `info_question` / `info_answer`, в `llm_response.sources` адрес страницы.

## 5. Прод

```bash
git pull                          # снимок приезжает с кодом
# одноразовый контейнер node:22-alpine на сети compose (как для rag:index-all):
pnpm install && pnpm db:migrate && pnpm site:import data/site-pages/tyumen.json
```

Браузер на сервере не нужен. Обновление знаний = перезапуск шага 2 локально, коммит снимка, шаг 5.
