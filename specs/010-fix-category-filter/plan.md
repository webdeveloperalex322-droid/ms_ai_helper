# Implementation Plan: Разрешение категории товара при подборе

**Branch**: `main` (ветка не создавалась, работаем в текущей) | **Date**: 2026-10-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-fix-category-filter/spec.md`

## Summary

Слот `category`, полученный из разбора сообщения (или из payload пресета), сейчас уходит в `CatalogFilters.categoryId` и сравнивается в SQL напрямую с `products.category_id`. В реальном каталоге `products.category_id` — это `categoryId` поставщика (venus), а слот — служебный слаг (`roll`, `set`), поэтому выборка всегда пуста.

Подход: ввести `CategoryResolverService` в `CatalogModule`, который по (rn, target) читает таблицу `categories` и преобразует произвольное название категории в множество реальных `category_id`. `CatalogFilters` переходит с `categoryId?: string` на `categoryIds?: string[]` (`inArray`). Резолв вызывается в трёх точках: `ShortlistBuilderService`, `SuggestionService.checkProductsExist`, скоринг в `HybridRetrieverService`. Дополнительно `IntentSlotParserService` получает список реальных слагов/названий категорий для (rn, target) вместо зашитого массива из шести значений, с откатом на старый список.

## Technical Context

**Language/Version**: TypeScript 5.x, Node >= 22

**Primary Dependencies**: NestJS 10 + Fastify, Drizzle ORM, pgvector, OpenAI SDK (через AITunnel)

**Storage**: PostgreSQL 15/16 + pgvector; задействованы существующие таблицы `categories`, `products`, `city_products` — изменений схемы и миграций НЕ требуется

**Testing**: Vitest (unit `src/**/*.spec.ts`, интеграционные `test/**/*.test.ts`)

**Target Platform**: Linux-контейнер (docker compose на прод-сервере)

**Project Type**: Модульный монолит (backend web-service)

**Performance Goals**: не ухудшить текущее время ответа `/v1/assistant/product-answer` более чем на 10% (SC-005); резолв категории не должен добавлять запрос в БД на каждый вызов — кэш в памяти с TTL

**Constraints**: дефект не воспроизводится на сид-данных (там `category_id` совпадает со слагом), поэтому финальная проверка — на боевом стенде; поведение при реально пустой выборке не меняем

**Scale/Scope**: ~22k проиндексированных строк каталога, десятки категорий на (rn, target); затрагиваются 6–8 файлов исходников + тесты

## Constitution Check

`.specify/memory/constitution.md` в репозитории не заполнен (остался шаблон с плейсхолдерами `[PRINCIPLE_N_NAME]`), проектных принципов-гейтов нет. Применяем конвенции из `CLAUDE.md` как фактические гейты:

| Гейт | Статус |
|------|--------|
| Доступ к БД через `@Inject(DATABASE_TOKEN) db: DrizzleDB`, схема из `src/database/schema` | PASS — новый сервис следует тому же шаблону |
| Никаких рукописных SQL-миграций; схема правится только через `db:generate` | PASS — схема не меняется |
| Доступ к env только через Zod-валидированный `configuration.ts` | PASS — новых env не вводим (TTL кэша — константа модуля) |
| Эндпоинт всегда отвечает, ошибки деградируют в fallback | PASS — сбой резолва трактуется как «категория не распознана» (FR-005/FR-008) |
| Тесты рядом с модулем (`src/modules/*/tests/*.spec.ts`) | PASS |

Нарушений нет, раздел Complexity Tracking не заполняется.

## Project Structure

### Documentation (this feature)

```text
specs/010-fix-category-filter/
├── plan.md              # этот файл
├── spec.md              # спецификация
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── category-resolver.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── modules/
│   ├── catalog/
│   │   ├── catalog.module.ts                      # + провайдер CategoryResolverService
│   │   ├── services/
│   │   │   ├── catalog.service.ts                 # CatalogFilters.categoryIds + inArray
│   │   │   └── category-resolver.service.ts       # НОВЫЙ
│   │   └── tests/
│   │       ├── category-resolver.spec.ts          # НОВЫЙ
│   │       └── catalog-filters.spec.ts            # НОВЫЙ
│   ├── assistant/
│   │   ├── services/
│   │   │   ├── shortlist-builder.service.ts       # резолв слота -> categoryIds
│   │   │   ├── intent-slot-parser.service.ts      # knownCategories из каталога
│   │   │   ├── assistant-orchestrator.service.ts  # прокидывание rn/target + label в fallback
│   │   │   └── fallback.service.ts                # отображаемое имя категории в тексте
│   │   └── tests/
│   │       ├── shortlist-builder.spec.ts          # НОВЫЙ
│   │       └── fallback.spec.ts                   # дополняется
│   ├── rag/
│   │   └── services/hybrid-retriever.service.ts   # бонус скоринга по categoryIds
│   └── suggestions/
│       ├── suggestions.module.ts                  # доступ к резолверу
│       └── services/suggestion.service.ts         # резолв в checkProductsExist
└── database/schema/categories.ts                   # без изменений
```

**Structure Decision**: сохраняем существующую модульную структуру NestJS. Резолвер живёт в `CatalogModule`, потому что он читает справочник каталога и нужен сразу трём потребителям (`assistant`, `suggestions`, косвенно `rag` через фильтры). `CatalogModule` уже экспортируется в `AssistantModule`; для `SuggestionsModule` он тоже уже импортирован (используется `CatalogService`).

## Ключевые решения реализации

1. **Резолв многоступенчатый и детерминированный** (точное совпадение → префикс → подстрока, с остановкой на первом непустом уровне) — см. [contracts/category-resolver.md](./contracts/category-resolver.md). Это убирает зависимость от конкретных слагов боевого справочника, которые не удалось просмотреть.
2. **Исторические слаги пресетов** (`roll`, `set`, `drink`, `sauce`, `dessert`, `hot`) раскрываются в набор синонимов (рус./лат.) перед сопоставлением — миграция данных пресетов не нужна (FR-003).
3. **Нераспознанная категория не обнуляет выдачу**: фильтр по категории просто не применяется (FR-005). Слот при этом остаётся в тексте запроса для векторного/ключевого поиска, то есть релевантность сохраняется.
4. **Кэш справочника** на (rn, target) в памяти процесса, TTL 5 минут, инвалидация по времени. Исключает лишний SQL на каждый запрос ассистента (SC-005).
5. **Деградация**: любая ошибка чтения справочника → резолв возвращает «не распознано», `knownCategories` откатывается на исторический список (FR-008).
6. **Текст отказа** использует отображаемое имя категории, если она резолвилась, иначе — исходное значение слота (FR-010).

## Риски

| Риск | Смягчение |
|------|-----------|
| Реальные слаги боевого справочника не совпадут ни с одним синонимом | Многоступенчатое сопоставление + матч по `name`; проверка на боевом стенде по quickstart; при промахе — расширить таблицу синонимов (данные, не логика) |
| Подстрочное сопоставление даст ложное совпадение | Подстрока — последний уровень, применяется только если точное и префиксное пусты; покрывается unit-тестами |
| Справочник `categories` на проде не заполнен | quickstart содержит проверку; при пустом справочнике поведение = текущее минус ложный отказ (FR-005) |
