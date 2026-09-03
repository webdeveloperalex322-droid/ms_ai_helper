# Quickstart: проверка массовой индексации (009-rag-bulk-index)

Сценарии проверяют US1–US5 из [spec.md](./spec.md). Все они выполняются на mock-провайдере — без внешних обращений и без затрат.

## Предусловия

```bash
pnpm install
docker-compose up -d          # Postgres с pgvector на :5432
pnpm db:migrate
pnpm db:seed                  # либо реальный импорт каталога
```

В `.env`: `EMBEDDING_PROVIDER=mock`, задан `DATABASE_URL`. Схема БД не меняется — новых миграций у этой фичи нет.

## Автоматические проверки

```bash
pnpm vitest run src/modules/rag/tests/bulk-index-options.spec.ts
pnpm vitest run src/modules/rag/tests/bulk-indexer.service.spec.ts
pnpm vitest run src/modules/rag/tests/embedding-batch.spec.ts
pnpm test                     # весь набор не должен деградировать
pnpm lint
```

## Сценарий 1 (US1) — первичная индексация

```bash
pnpm rag:index-all
echo "exit=$?"
```

Ожидается: стартовый блок с параметрами, обновляющаяся строка прогресса, итоговый отчёт, `exit=0`.

Контроль в БД:

```sql
SELECT embedding_status, count(*) FROM product_chunks GROUP BY 1;
SELECT count(*) FROM city_products;                -- совпадает с числом чанков
SELECT count(*) FROM product_embeddings;           -- совпадает с числом ready-чанков
```

## Сценарий 2 (US3) — дешёвый повторный запуск

```bash
pnpm rag:index-all
```

Ожидается: `processed: 0`, `skipped` равно общему числу позиций, `exit=0`, прогон заметно быстрее первого.

## Сценарий 3 (US3) — реакция на изменение данных

```sql
UPDATE products SET description = description || ' обновлено' WHERE id = '<любой id>';
```

```bash
pnpm rag:index-all
```

Ожидается: `processed` равно числу строк `city_products` изменённого товара, остальные пропущены.

## Сценарий 4 (US3) — смена модели

```bash
EMBEDDING_PROVIDER=openai pnpm rag:index-all --dry-run
```

Ожидается: `would process` равно общему числу позиций — векторы прежней модели к переиспользованию непригодны. (Реальный прогон под `openai` платный, здесь достаточно `--dry-run`.)

## Сценарий 5 (US2) — срез каталога

```bash
pnpm rag:index-all --br <uuid города> --force
```

Ожидается: в отчёте `total` равен числу позиций этого города; статусы позиций других городов не изменились:

```sql
SELECT br, max(updated_at) FROM product_chunks GROUP BY br;
```

## Сценарий 6 (US2) — пустая выборка

```bash
pnpm rag:index-all --br 00000000-0000-0000-0000-000000000000
echo "exit=$?"
```

Ожидается: явное сообщение о пустой выборке, `exit=2`.

## Сценарий 7 (US5) — предварительная оценка

```bash
pnpm rag:index-all --dry-run
echo "exit=$?"
```

Ожидается: `would process` / `would skip` / `total`, `exit=0`, и **ни одной** изменённой записи:

```sql
SELECT max(updated_at) FROM product_chunks;    -- то же значение, что и до запуска
```

## Сценарий 8 (US4) — устойчивость к сбоям

Проверяется юнит-тестом `bulk-indexer.service.spec.ts` с провайдером-заглушкой:

- провайдер падает на первых двух попытках пачки, на третьей отвечает → все позиции `ready`, отчёт без ошибок;
- провайдер стабильно падает на пачке → пачка разбирается по одной позиции, сбойные помечаются `failed`, остальные проходят;
- провайдер возвращает вектор длиной 8 при ожидаемых 1536 → позиция `failed`, повторов нет, прогон продолжается.

Ручная проверка ненулевого кода при частичном сбое:

```bash
EMBEDDING_PROVIDER=openai OPENAI_API_KEY=invalid pnpm rag:index-all --limit 5 --retries 1
echo "exit=$?"     # ожидается 3, отчёт содержит перечень неуспешных позиций
```

## Сценарий 9 — прерывание оператором

Запустить полный прогон и прервать `Ctrl+C` на середине; повторный запуск должен пропустить уже обработанное и завершить остаток (`skipped` > 0, `exit=0`).

## Сценарий 10 — итог по релевантности (SC-002)

После полной индексации:

```bash
pnpm start:dev
curl -X POST http://localhost:3000/v1/assistant/product-answer \
  -H 'Content-Type: application/json' \
  -d '{"rn":"<rn>","br":"<br>","target":"WEB","user_message":"что-нибудь острое с лососем"}'
```

В логах ответа подбор кандидатов должен идти смысловым поиском, а не запасным сценарием «все товары города».
