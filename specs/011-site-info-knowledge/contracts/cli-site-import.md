# Contract: `pnpm site:import`

Загружает снимок в БД: upsert страниц, нарезка на чанки, эмбеддинги. Браузер не нужен. Учитывает `EMBEDDING_PROVIDER` / `EMBEDDING_MODEL` из `.env` (как `rag:index-all`).

```
pnpm site:import <snapshot.json> [--force] [--dry-run] [--help]
```

| Параметр | Смысл |
|----------|-------|
| `<snapshot.json>` | путь к снимку (обязателен) |
| `--force` | переиндексировать все страницы снимка, игнорируя правило пропуска |
| `--dry-run` | посчитать, что было бы сделано, без записи и без обращений к поставщику векторов |

**Правило пропуска** (см. data-model → переходы): страница пропускается, если `content_hash` совпал, все её чанки `ready` и `model_name` эмбеддингов равен `provider.modelName()`.

**Отчёт** (stdout):

```
Site knowledge import
  snapshot:  data/site-pages/tyumen.json  (tyumen, 2026-10-02T06:00:00Z, 14 pages)
  provider:  text-embedding-3-small
  mode:      incremental

  /about                    inserted   5 chunks
  /delivery                 skipped
  /promotions               updated    9 chunks
  /our-restourants          failed     provider error: 429 ...
  ...
pages: inserted=3 updated=1 skipped=9 failed=1 (snapshot failed pages ignored: 0)
chunks: indexed=14 failed=0
```

**Коды возврата**: `0` — без ошибок; `3` — есть страницы/чанки `failed`; `1` — снимок не читается / невалиден (нет `version`, `rn`, `br`, `pages`), ошибка БД.

**Модули**: argv → `parseImportArgs()` (`cli-options.ts`), чтение+валидация → `readSnapshot()`, запись → `SitePageImportService.importSnapshot(snapshot, { force, dryRun })` → `PageChunker` + `SitePageIndexerService`.

**Сигнатура сервиса**

```ts
interface ImportOptions { force?: boolean; dryRun?: boolean }
interface ImportPageResult { url: string; action: 'inserted' | 'updated' | 'skipped' | 'failed' | 'ignored'; chunks: number; error?: string }
interface ImportReport { pages: ImportPageResult[]; inserted: number; updated: number; skipped: number; failed: number; ignored: number; chunksIndexed: number; chunksFailed: number; durationMs: number; dryRun: boolean }
importSnapshot(snapshot: CrawlSnapshot, options?: ImportOptions): Promise<ImportReport>
```

`ignored` — страницы со `status: failed` в снимке (в БД не трогаются).
