# Implementation Plan: Массовая индексация каталога для векторного поиска

**Branch**: `009-rag-bulk-index` | **Date**: 2026-09-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-rag-bulk-index/spec.md`

## Summary

Нужен инструмент, который за один запуск строит поисковые чанки и векторы для всего каталога (`city_products ⋈ products`), умеет работать по срезу `rn/br/target`, дёшево переигрывается на неизменившихся данных и не падает от единичной ошибки поставщика векторов.

Подход: логика обхода живёт в `RagBulkIndexerService` внутри модуля RAG (тестируема, переиспользуема), а `scripts/rag-index-all.ts` — тонкая CLI-обёртка в стиле существующего [rag-index-product.ts](../../scripts/rag-index-product.ts). Выборка идёт keyset-страницами по 500 строк с `LEFT JOIN` на `product_chunks`/`product_embeddings`; решение «пропустить» принимается локально по совпадению `content_hash` + `model_name` + статуса `ready`. Векторы запрашиваются пачками через `EmbeddingProvider.embedBatch` (новый метод `EmbeddingService.buildForChunks`), пачки идут с ограничением одновременности и повторами с экспоненциальным backoff, при исчерпании попыток пачка разбирается по одной позиции для изоляции сбойной.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js >= 22, ESM через `tsx`

**Primary Dependencies**: Drizzle ORM 0.38, `pg` (Pool), `dotenv`, существующие сервисы модуля RAG (`SearchableTextBuilderService`, `EmbeddingService`), `AitunnelOpenAIClientService` для реального провайдера. Новых прод-зависимостей не вводится (пул одновременности пишется вручную — см. [research.md](./research.md) R6).

**Storage**: PostgreSQL 15+ с pgvector; таблицы `city_products`, `products`, `product_chunks`, `product_embeddings`. Изменений схемы и миграций **не требуется**.

**Testing**: Vitest. Юнит-тесты — `src/modules/rag/tests/*.spec.ts` (фейковые `db` и `EmbeddingProvider`, реальный `SearchableTextBuilderService`). Код в `scripts/` тестами не покрывается (вне `include` в [vitest.config.ts](../../vitest.config.ts)) — поэтому вся суть вынесена в `src/`.

**Target Platform**: Linux/Windows-сервер приложения, ручной запуск оператором через `pnpm rag:index-all`.

**Project Type**: CLI-инструмент поверх существующего модульного монолита NestJS.

**Performance Goals**: 10 000 позиций за один прогон; ~313 обращений к поставщику векторов вместо 10 000 (пачки по 32); холостой повторный прогон — ноль обращений к поставщику.

**Constraints**: постоянный расход памяти независимо от размера каталога (keyset-страницы по 500); единичная ошибка не прерывает прогон; ключи доступа не попадают в вывод; прерывание оператором не теряет уже записанные результаты.

**Scale/Scope**: 3 новых файла в `src/`, 1 скрипт, 1 метод в существующем сервисе, 1 строка в `package.json`, 3 файла тестов.

## Constitution Check

*GATE: перед фазой 0 и повторно после фазы 1.*

Файл [.specify/memory/constitution.md](../../.specify/memory/constitution.md) — незаполненный шаблон (плейсхолдеры `[PRINCIPLE_N_NAME]`), проектных принципов не задаёт. Применимых гейтов нет — проверка пройдена вырожденно, в обе стороны (до и после фазы 1).

Вместо конституции план сверен с действующими соглашениями репозитория из [CLAUDE.md](../../CLAUDE.md):

| Соглашение | Соблюдение |
|------------|------------|
| Доступ к env только через Zod-схему `configuration.ts` | Частично: скрипт работает вне Nest-контейнера и читает `process.env` напрямую через `configShim` — ровно как существующий `rag-index-product.ts` и `seeds/`. Новых переменных окружения не вводится. |
| Схема БД правится только через `db:generate`/`db:migrate`, руками SQL не пишется | Соблюдено: изменений схемы нет вообще. |
| Алиас `@/` → `src/` | Соблюдено в коде `src/`; скрипт использует относительные пути, как соседний скрипт. |
| Тесты в `src/**/*.spec.ts` | Соблюдено. |
| Непростые решения фиксируются в `docs/knowledge/decisions.md` | Запланировано задачами T042 (фаза 8) и T054 (фаза 9). |

**Complexity Tracking**: нарушений нет, раздел не заполняется.

## Project Structure

### Documentation (this feature)

```text
specs/009-rag-bulk-index/
├── plan.md              # этот файл
├── spec.md              # фаза /speckit-specify
├── research.md          # фаза 0
├── data-model.md        # фаза 1
├── quickstart.md        # фаза 1
├── contracts/
│   └── cli.md           # фаза 1 — контракт CLI
├── checklists/
│   └── requirements.md
└── tasks.md             # фаза 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/modules/rag/
├── services/
│   ├── bulk-indexer.service.ts          # НОВЫЙ: обход, пропуск, пачки, ретраи, отчёт
│   ├── embedding.service.ts             # ИЗМЕНЁН: + buildForChunks(chunkIds)
│   └── searchable-text-builder.service.ts  # без изменений (используется как есть)
├── bulk-index-options.ts                # НОВЫЙ: разбор и валидация аргументов CLI + коды возврата
├── rag.module.ts                        # ИЗМЕНЁН: регистрация RagBulkIndexerService
└── tests/
    ├── bulk-index-options.spec.ts       # НОВЫЙ
    ├── bulk-indexer.service.spec.ts     # НОВЫЙ
    └── embedding-batch.spec.ts          # НОВЫЙ

scripts/
├── rag-index-all.ts                     # НОВЫЙ: CLI-обёртка
└── rag-index-product.ts                 # без изменений (образец стиля)

package.json                             # ИЗМЕНЁН: скрипт rag:index-all
tsconfig.json                            # ИЗМЕНЁН: scripts/**/* в include → dist/scripts/ попадает в артефакт (FR-017)
docs/knowledge/decisions.md              # ИЗМЕНЁН: ADR о массовой индексации + ADR о scripts/ в артефакте
```

**Deployment note**: `scripts/` изначально не входил в `include` файла `tsconfig.json`, поэтому CLI-обёртка не попадала в `dist/` и не могла быть запущена в развёрнутой среде (там нет ни исходных текстов, ни `tsx` — образ ставит зависимости через `pnpm install --prod`). `include` расширяется по образцу `seeds/`, который уже компилируется в `dist/seeds/`. Форма запуска повторяет применение миграций: `node dist/scripts/rag-index-all.js` (FR-018). Отдельный `COPY` в `Dockerfile` не нужен — артефакт переносится целиком.

**Structure Decision**: существующая структура модульного монолита сохраняется. Новый код целиком укладывается в модуль `src/modules/rag/`, потому что это его предметная область (построение и хранение поисковых представлений). Отдельный модуль не заводится: он не имел бы ни контроллеров, ни собственных сущностей. `scripts/` остаётся зоной тонких обёрток без бизнес-логики — это же правило делает логику покрываемой тестами.

## Phase 0: Research

Выполнено — [research.md](./research.md). Разрешено 12 вопросов: единица обхода (R1), keyset-пагинация (R2), правило пропуска по `content_hash` + `model_name` + статус (R3), пакетные вызовы `embedBatch` с пофрагментным разбором сбоя (R4), место записи вектора (R5), собственный пул одновременности без новой зависимости (R6), классификация ошибок для ретраев (R7), проверка размерности (R8), размещение кода ради тестируемости (R9), сборка зависимостей вне Nest-контейнера (R10), формат прогресса (R11), коды завершения (R12). Открытых `NEEDS CLARIFICATION` не осталось.

## Phase 1: Design & Contracts

- **Модель данных**: [data-model.md](./data-model.md) — используются существующие таблицы, миграций нет; описаны инварианты, правило пропуска и переходы состояния `embedding_status`.
- **Контракт CLI**: [contracts/cli.md](./contracts/cli.md) — флаги, значения по умолчанию, формат вывода, коды возврата, контракт `RagBulkIndexerService` и нового `EmbeddingService.buildForChunks`.
- **Проверка**: [quickstart.md](./quickstart.md) — прогоняемые сценарии на mock-провайдере, покрывающие US1–US5.
- **Контекст агента**: секция `<!-- SPECKIT ... -->` в `.cursor/rules/specify-rules.mdc` обновляется опциональным хуком `speckit.agent-context.update`.

**Constitution Check (повторно, после дизайна)**: без изменений — конституция пуста, соглашения репозитория соблюдены, отступление одно и оно унаследовано от существующего скрипта (чтение `process.env` вне Nest-контейнера).

## Риски и их снятие

| Риск | Снятие |
|------|--------|
| Расхождение формулы `content_hash` между скриптом и `upsertChunk` → вечная переиндексация | Хэш считается тем же `SearchableTextBuilderService.buildSearchableText` + MD5; тест сверяет, что второй прогон даёт 100% пропусков |
| Сбой поставщика на пачке теряет 32 позиции | После исчерпания попыток пачка разбирается по одной позиции |
| Долгий прогон прерван оператором | Запись идёт постранично; уже сохранённые чанки и векторы остаются, повторный запуск пропускает готовые |
| Ошибочный `--concurrency 100` вызывает rate limit | Значение ограничивается сверху (10) с предупреждением |
| Дорогой прогон запущен по ошибке | Режим `--dry-run` и печать применённых параметров перед стартом |
