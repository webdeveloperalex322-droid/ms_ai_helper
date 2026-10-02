# Data Model: База знаний по информационным страницам сайта

**Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

## Таблицы (Drizzle, `src/database/schema/`)

### `site_pages` — информационная страница сайта

| Колонка | Тип | Ограничения | Назначение |
|---------|-----|-------------|------------|
| `id` | uuid | PK, default random | |
| `rn` | uuid | NOT NULL | сеть |
| `br` | uuid | NOT NULL | город |
| `url` | text | NOT NULL | полный адрес страницы |
| `page_key` | text | NOT NULL | короткий ключ (`about`, `delivery`, `promotions/den-rozhdeniya`) |
| `title` | text | NOT NULL | заголовок страницы |
| `content` | text | NOT NULL | очищенный текст (markdown-подобный) |
| `content_hash` | text | NOT NULL | md5 от `content` |
| `source` | text | NOT NULL, default `'crawler'` | откуда взято (`crawler` / `manual`) |
| `fetched_at` | timestamp | NOT NULL | время сбора страницы |
| `is_active` | boolean | NOT NULL, default true | участвует ли в поиске |
| `created_at`, `updated_at` | timestamp | NOT NULL, default now | |

Уникальность: `(rn, br, url)` — `site_pages_rn_br_url_uniq`. Индекс `(rn, br, is_active)`.

### `site_page_chunks` — фрагмент страницы

| Колонка | Тип | Ограничения | Назначение |
|---------|-----|-------------|------------|
| `id` | uuid | PK | |
| `page_id` | uuid | FK → `site_pages.id` ON DELETE CASCADE, NOT NULL | |
| `rn`, `br` | uuid | NOT NULL | дублируются для фильтрации без JOIN |
| `chunk_index` | integer | NOT NULL | порядок внутри страницы |
| `heading` | text | | путь заголовков раздела (`Условия доставки › Способы оплаты`) |
| `text` | text | NOT NULL | текст для индексации: заголовок страницы + heading + тело |
| `content_hash` | text | NOT NULL | md5 от `text` |
| `embedding_status` | text | NOT NULL, default `'pending'` | `pending` / `ready` / `failed` |
| `updated_at` | timestamp | NOT NULL | |

Уникальность: `(page_id, chunk_index)`. Индекс `(rn, br, embedding_status)`.

### `site_page_embeddings` — вектор фрагмента

| Колонка | Тип | Ограничения |
|---------|-----|-------------|
| `chunk_id` | uuid | PK, FK → `site_page_chunks.id` ON DELETE CASCADE |
| `embedding` | vector(1536) | |
| `model_name` | text | NOT NULL |
| `content_hash` | text | NOT NULL |
| `updated_at` | timestamp | NOT NULL |

Тип `vector` — общий `customType` в `src/database/schema/vector.ts`, импортируется и `product_embeddings`, и `site_page_embeddings` (SQL-тип не меняется, миграция товаров не нужна).

## Снимок сбора (`data/site-pages/<city>.json`)

```jsonc
{
  "version": 1,
  "site_url": "https://tyumen.sushi-master.ru",
  "city_slug": "tyumen",
  "rn": "A79C5050-1EE7-11EB-9B6E-05B5FC40DF2A",
  "br": "E3AFD1AC-4D3D-EA11-A958-8B023DE8EF69",
  "crawled_at": "2026-10-02T06:00:00.000Z",
  "pages": [
    {
      "key": "delivery",
      "path": "/delivery",
      "url": "https://tyumen.sushi-master.ru/delivery",
      "title": "Стоимость доставки суши и роллов, условия доставки в Тюмени",
      "status": "ok",                    // "ok" | "failed"
      "error": null,                     // причина при failed
      "fetched_at": "2026-10-02T06:00:41.000Z",
      "content_hash": "md5…",
      "content": "# Стоимость доставки …\n## Условия доставки\n…"
    }
  ]
}
```

Правила: `content` обязателен при `status = ok` и имеет длину ≥ 200 символов (иначе краулер ставит `failed`, `error: "empty content"`); `url` уникален внутри снимка; `key` = путь без ведущего слэша как есть (`delivery`, `promotions/den-rozhdeniya`), для корня — `home`.

## Переходы состояний

### Страница при импорте снимка

```
снимок.status = failed            → страница в БД не трогается (прежняя версия остаётся)
нет строки (rn, br, url)          → INSERT page, INSERT chunks (pending), эмбеддинги → ready/failed
строка есть, hash совпал,
  все чанки ready, модель та же   → skip
строка есть, hash совпал,
  но есть чанки не ready / другая модель → переиндексация только эмбеддингов
строка есть, hash отличается      → UPDATE page, DELETE старых чанков (cascade embeddings), INSERT новых
--force                           → как при изменении hash
```

### Фрагмент

`pending` → `ready` (вектор записан) | `failed` (ошибка поставщика / неверная размерность). Повторный импорт переводит `failed` → `pending` → …

## Производные структуры (TypeScript, не таблицы)

- `CrawlSnapshot`, `CrawlSnapshotPage` — форма снимка выше.
- `PageChunkDraft { index, heading, text }` — результат чанкера до записи.
- `KnowledgePassage { chunkId, pageId, url, title, heading, text, score, semanticScore, keywordScore }` — результат поиска.
- `InfoAnswerResult` — `{ kind: 'answer' | 'not_found' | 'empty' | 'timeout', reply_text, quick_replies, source?: { url, title }, sources: string[] }`.
- `ai_logs.llm_response` для сервисных ответов: `{ kind: 'info', sources: string[], not_found: boolean }`.

## Связь с существующими сущностями

- `ai_logs.intent = 'info_question'`, `validation_status ∈ { info_answer, info_not_found, info_empty, info_timeout }`, `retrieved_product_ids = []`, `selected_product_ids = []`.
- `assistant_suggestions.payload.intent = 'info_question'`, `retrieval_query` — текст вопроса; `availability_rules.check_products_exist = false` для таких пресетов (иначе существующая проверка товаров скроет их — данные, не код).
