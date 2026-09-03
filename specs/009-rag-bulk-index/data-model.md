# Data Model: массовая индексация каталога (009-rag-bulk-index)

**Миграции не требуются.** Фича не добавляет и не меняет ни одной таблицы и ни одной колонки — она заполняет то, что уже описано схемой.

## Задействованные таблицы

### `city_products` — единица обхода

Источник: [city-products.ts](../../src/database/schema/city-products.ts)

| Колонка | Роль в фиче |
|---------|-------------|
| `id` (uuid, PK) | ключ keyset-пагинации (`ORDER BY id`, `WHERE id > :lastId`) |
| `rn`, `br`, `target` | фильтры `--rn/--br/--target`; вместе с `product_id` образуют уникальный ключ `city_products_uniq` |
| `product_id` | соединение с `products` |
| `price`, `is_available` | входят в поисковый текст, поэтому влияют на `content_hash` |

Читается только на чтение.

### `products` — атрибуты товара

Источник: [products.ts](../../src/database/schema/products.ts). Поля `name`, `categoryName`, `description`, `ingredients`, `allergens`, `tags`, `weight`, `pieces`, КБЖУ, `attributes` формируют поисковый текст. Читается только на чтение.

### `product_chunks` — поисковое представление

Источник: [product-chunks.ts](../../src/database/schema/product-chunks.ts). Пишется через существующий `SearchableTextBuilderService.upsertChunk`.

Логический ключ — `(product_id, br, target)`; физический PK — `id`. Поле `rn` хранится, но в ключ поиска чанка не входит.

| Колонка | Значение для фичи |
|---------|-------------------|
| `searchable_text` | текст, собранный `buildSearchableText` |
| `content_hash` | MD5 от `searchable_text`; основание для решения о пропуске |
| `embedding_status` | `pending` \| `ready` \| `failed` |
| `metadata` | снимок полей товара, используется поиском |

### `product_embeddings` — вектор

Источник: [product-embeddings.ts](../../src/database/schema/product-embeddings.ts). Пишется через `EmbeddingService`.

| Колонка | Значение для фичи |
|---------|-------------------|
| `chunk_id` (PK, FK → `product_chunks.id`, `ON DELETE CASCADE`) | связь один-к-одному с чанком |
| `embedding` | `vector(1536)`; длина сверяется с `provider.dimensions()` перед записью |
| `model_name` | идентификатор способа получения вектора; входит в правило пропуска |
| `content_hash` | хэш текста, для которого построен вектор |

## Инварианты

- **INV-1**: чанк логически ключуется тройкой `(product_id, br, target)` при `chunk_type = 'main'`. **Ограничением БД это не закреплено**: в `product_chunks` есть только индекс `idx_product_chunks_product_br`, а `upsertChunk` работает по схеме select-then-insert. Два следствия, которые обязан учитывать индексатор:
  - ключ чанка не содержит `rn`, тогда как `city_products` уникален по `(rn, br, target, product_id)` — значит две строки каталога с разными `rn`, но совпадающими `br/target/product_id` отображаются в **один** чанк;
  - такие строки, попав в разные пачки одного прогона, породят гонку и дубль чанка.

  Поэтому индексатор **дедуплицирует кандидатов по `(product_id, br, target)` в пределах прогона**, оставляя первую строку по порядку обхода. Дубль, приходящий от двух одновременно запущенных процессов, за скоп фичи вынесен (см. Assumptions в [spec.md](./spec.md)).
- **INV-2**: у каждого чанка есть не более одной строки `product_embeddings` (гарантировано PK по `chunk_id`).
- **INV-3**: `embedding_status = 'ready'` ⟹ существует `product_embeddings` с тем же `content_hash`, что и у чанка. Обратное неверно: вектор может остаться от прежней редакции текста — поэтому правило пропуска сверяет хэши, а не только статус.
- **INV-4**: `product_embeddings.model_name` описывает способ, которым получен именно этот вектор; векторы разных моделей несравнимы и не должны соседствовать в одной выдаче поиска.

## Правило пропуска (FR-004)

Позиция пропускается тогда и только тогда, когда выполнены все три условия:

```text
embeddings.content_hash == md5(buildSearchableText(row))
AND embeddings.model_name == provider.modelName()
AND chunks.embedding_status == 'ready'
```

При `--force` правило не применяется: обрабатываются все позиции выборки.

Обоснование каждого условия — [research.md](./research.md) R3.

## Переходы `embedding_status`

```text
(нет чанка) ──upsertChunk──> pending
pending ──вектор записан──> ready
pending ──все попытки исчерпаны / неверная размерность──> failed
ready ──изменился текст (upsertChunk)──> pending
failed ──повторный запуск──> pending ──> ready | failed
```

`upsertChunk` при совпавшем `content_hash` возвращает существующий чанк **не меняя статус** — именно поэтому чанк в статусе `failed` с актуальным хэшем не «залипает»: правило пропуска его не пропустит (нет `ready`), и позиция уйдёт на переобработку.

## Запрос выборки страницы

Одним запросом на страницу (`pageSize` = 500):

```text
SELECT city_products.*, products.*, chunks.id, chunks.content_hash, chunks.embedding_status,
       embeddings.content_hash, embeddings.model_name
FROM city_products
JOIN products ON products.id = city_products.product_id
LEFT JOIN product_chunks chunks
       ON chunks.product_id = city_products.product_id
      AND chunks.br = city_products.br
      AND chunks.target = city_products.target
LEFT JOIN product_embeddings embeddings ON embeddings.chunk_id = chunks.id
WHERE (:rn IS NULL OR city_products.rn = :rn)
  AND (:br IS NULL OR city_products.br = :br)
  AND (:target IS NULL OR city_products.target = :target)
  AND city_products.id > :lastId
ORDER BY city_products.id
LIMIT 500
```

Строится через Drizzle query builder; сырой SQL не пишется.

## Сущности времени выполнения (в памяти, не в БД)

- **`IndexCandidate`** — строка выборки, приведённая к `ProductWithCityData`, плюс вычисленный `contentHash`, существующий `chunkId`, статус и данные вектора.
- **`IndexRunReport`** — `total`, `processed`, `skipped`, `failed`, `durationMs`, `failures: { productId, br, target, reason }[]`, `dryRun`, применённые фильтры и параметры.
