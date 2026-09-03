# Contract: CLI и внутренние интерфейсы (009-rag-bulk-index)

## 1. Команда

```bash
pnpm rag:index-all [options]
```

Реализация: `scripts/rag-index-all.ts`, запуск через `tsx` (по образцу `pnpm rag:index`).

### Флаги

| Флаг | Значение | По умолчанию | Поведение |
|------|----------|--------------|-----------|
| `--rn <uuid>` | фильтр по сети | не задан | ограничивает выборку |
| `--br <uuid>` | фильтр по городу | не задан | ограничивает выборку |
| `--target <str>` | фильтр по витрине (`WEB`, `APP`, …) | не задан | ограничивает выборку |
| `--force` | флаг | выкл. | отключает правило пропуска, переиндексирует всё в выборке |
| `--dry-run` | флаг | выкл. | считает и печатает объём работ, ничего не пишет и не зовёт поставщика векторов |
| `--batch-size <n>` | размер пачки для `embedBatch` | `32` | допустимо 1…128, вне диапазона — ошибка аргумента |
| `--concurrency <n>` | одновременных пачек | `3` | допустимо 1…10; больше — усечение до 10 с предупреждением на stderr |
| `--page-size <n>` | размер страницы выборки из БД | `500` | допустимо 50…5000 |
| `--retries <n>` | попыток на пачку | `3` | допустимо 1…10 |
| `--limit <n>` | обработать не более N позиций и остановиться | не задан | для пробных прогонов |
| `--help` | флаг | — | печатает справку, код возврата `0` |

Неизвестный флаг, нечисловое значение числового флага, значение вне диапазона, `--rn/--br` не в формате uuid → сообщение на stderr и код возврата `1`.

### Переменные окружения

Читаются из `.env` (или `.env.test` при `NODE_ENV=test`), новых не вводится: `DATABASE_URL` (обязательна), `EMBEDDING_PROVIDER` (`mock` | `openai`, по умолчанию `mock`), `EMBEDDING_MODEL`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`.

Значения ключей **не печатаются** ни в одном режиме вывода (FR-016).

### Коды возврата

| Код | Значение |
|-----|----------|
| `0` | прогон завершён, неуспешных позиций нет (в том числе `--dry-run` и `--help`) |
| `1` | нештатное завершение: неверный аргумент, нет `DATABASE_URL`, недоступна БД, необработанное исключение |
| `2` | выборка пуста — под заданные фильтры не подошла ни одна позиция |
| `3` | прогон дошёл до конца, но есть позиции в состоянии `failed` |

### Формат вывода

Стартовый блок (stdout), до первого обращения к БД по существу:

```text
RAG bulk index
  provider:    mock-embedding-v1
  filters:     rn=<...> br=<any> target=<any>
  batch size:  32   concurrency: 3   page size: 500   retries: 3
  mode:        incremental        (или: force | dry-run)
```

Строка прогресса (stdout, перезаписью через `\r`, не чаще одного раза в 2 с и по завершении каждой страницы):

```text
  1280/10000  ok=1180 skip=90 fail=10  42.7 it/s  ETA 03:24
```

Итоговый отчёт (stdout):

```text
Done in 04:12
  total:     10000
  processed: 9890
  skipped:   90
  failed:    20
Failed items (first 50 of 20):
  product=<uuid> br=<uuid> target=WEB — embedding provider error: 429 rate limit
```

При `--dry-run` вместо отчёта о выполнении печатается оценка: `would process: N, would skip: M, total: K`.

Строка прогресса подавляется, если stdout не является TTY (перенаправление в файл/CI): вместо перезаписи печатается одна строка на страницу.

## 2. `RagBulkIndexerService`

Файл: `src/modules/rag/services/bulk-indexer.service.ts`

```ts
export interface BulkIndexFilters {
  rn?: string;
  br?: string;
  target?: string;
}

export interface BulkIndexOptions extends BulkIndexFilters {
  force?: boolean;        // default false
  dryRun?: boolean;       // default false
  batchSize?: number;     // default 32
  concurrency?: number;   // default 3
  pageSize?: number;      // default 500
  retries?: number;       // default 3
  limit?: number;         // default undefined
  retryBaseDelayMs?: number; // база backoff, default 1000 (понижается в тестах)
  onProgress?: (p: BulkIndexProgress) => void;
  signal?: AbortSignal;   // мягкая остановка на границе страницы
}

export interface BulkIndexProgress {
  total: number;      // известно после первого COUNT
  seen: number;
  processed: number;
  skipped: number;
  failed: number;
}

export interface BulkIndexFailure {
  productId: string;
  br: string;
  target: string;
  reason: string;     // сообщение об ошибке, без секретов
}

export interface BulkIndexReport {
  total: number;
  processed: number;
  skipped: number;
  failed: number;
  durationMs: number;
  failures: BulkIndexFailure[];
  dryRun: boolean;
  aborted: boolean;   // прогон остановлен по signal
}

export class RagBulkIndexerService {
  async run(options?: BulkIndexOptions): Promise<BulkIndexReport>;
}
```

**Гарантии**

- `run()` не выбрасывает исключение из-за ошибок отдельных позиций — они попадают в `failures`. Исключение возможно только при отказе БД или нарушении контракта аргументов.
- `processed + skipped + failed === total`, если прогон не был прерван и не задан `limit`.
- При `dryRun: true` не выполняется ни одной записи в БД и ни одного вызова провайдера векторов; `processed` означает «было бы обработано».
- `onProgress` вызывается не чаще одного раза на пачку; сервис не форматирует вывод (это дело CLI).
- Порядок обхода — по `city_products.id`; повторный запуск после прерывания корректен без внешнего состояния.
- Кандидаты дедуплицируются по `(product_id, br, target)`: повторная строка каталога (другой `rn`) попадает в `skipped`.
- Классификация ошибки пачки: **ретраибельная** (сеть, таймаут, 429, 5xx) → повтор с backoff, после исчерпания попыток пачка разбирается по одной позиции; **неретраибельная** (например 401) → вся пачка сразу помечается неуспешной, повторов и разбора нет.

## 3. `EmbeddingService.buildForChunks` (новый метод)

Файл: `src/modules/rag/services/embedding.service.ts`

```ts
export interface ChunkEmbeddingResult {
  chunkId: string;
  status: 'ready' | 'failed';
  error?: string;
}

// Существующий метод сохраняет поведение (глушит ошибку в лог, ставит failed):
async buildForChunk(chunkId: string): Promise<void>;

// Новый: пакетная обработка через EmbeddingProvider.embedBatch
async buildForChunks(chunkIds: string[]): Promise<ChunkEmbeddingResult[]>;
```

**Контракт `buildForChunks`**

- Возвращает по одному результату на каждый переданный `chunkId`, в том же порядке.
- Несуществующий `chunkId` → `status: 'failed'`, `error: 'chunk not found'`.
- Длина вектора сверяется с `provider.dimensions()`; расхождение → `failed` с сообщением, содержащим ожидаемую и фактическую длину, запись не выполняется.
- Успешная позиция: апсерт `product_embeddings` (`chunk_id`, `embedding`, `model_name`, `content_hash` из чанка, `updated_at`) + `product_chunks.embedding_status = 'ready'`.
- Ошибка поставщика на весь пакет → метод **выбрасывает** исключение (вызывающий решает, повторять ли); статусы при этом не меняются. Ошибки, относящиеся к конкретной позиции (нет чанка, неверная размерность), исключения не вызывают.
- `buildForChunk(id)` = `buildForChunks([id])` с перехватом исключения и записью `failed` — внешнее поведение существующих вызовов не меняется.

## 4. `parseBulkIndexArgs` (разбор аргументов)

Файл: `src/modules/rag/bulk-index-options.ts`

```ts
export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_EMPTY = 2;
export const EXIT_PARTIAL_FAILURE = 3;

export type ParseResult =
  | { kind: 'options'; options: BulkIndexOptions; warnings: string[] }
  | { kind: 'help' }
  | { kind: 'error'; message: string };

export function parseBulkIndexArgs(argv: string[]): ParseResult;
export function formatHelp(): string;
```

Чистая функция без побочных эффектов: не читает окружение, не пишет в консоль, не завершает процесс. Это делает её полностью покрываемой юнит-тестами.
