---
description: "Task list for 010-fix-category-filter"
---

# Tasks: Разрешение категории товара при подборе

**Input**: Design documents from `/specs/010-fix-category-filter/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/category-resolver.md](./contracts/category-resolver.md)

**Tests**: включены. Дефект не воспроизводится на сид-данных, поэтому поведение резолва фиксируется юнит-тестами до реализации (TDD), иначе регрессия не ловится ничем, кроме ручной проверки на проде.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: можно выполнять параллельно (разные файлы, нет зависимостей)
- **[Story]**: US1 / US2 / US3 из spec.md

## Path Conventions

Модульный монолит NestJS: исходники в `src/modules/<module>/`, тесты рядом в `src/modules/<module>/tests/*.spec.ts`, интеграционные — в `test/integration/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: ничего устанавливать и генерировать не требуется — схема БД и зависимости не меняются.

- [X] T001 Убедиться, что рабочее дерево чистое и тесты зелёные до правок: `pnpm test`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: контракт резолвера и фильтра — на нём стоят все три истории.

**⚠️ CRITICAL**: без T002–T008 ни одна user story не реализуема.

- [X] T002 Написать падающие юнит-тесты резолва в `src/modules/catalog/tests/category-resolver.spec.ts`: точное совпадение по `slug`, по `category_id`, по `name`; нечувствительность к регистру и пробелам; совпадение нескольких категорий → несколько `categoryIds`; промах → `matched: false`; пустой/`null` вход → `matched: false`; ошибка БД → `matched: false` без исключения
- [X] T003 [P] Дописать в `src/modules/catalog/tests/category-resolver.spec.ts` тесты уровней сопоставления: префикс срабатывает только при пустом точном уровне, подстрока — только при пустых точном и префиксном; исторические слаги `roll`/`set` находят категории с русскими `slug`/`name`
- [X] T004 [P] Написать падающие тесты `listOptions` в `src/modules/catalog/tests/category-resolver.spec.ts`: возвращает активные `{slug,name}` для (rn,target), обрезает список до 40, при пустом справочнике и при ошибке БД отдаёт исторический список из шести слагов
- [X] T005 Реализовать `CategoryResolverService` в `src/modules/catalog/services/category-resolver.service.ts` по контракту [contracts/category-resolver.md](./contracts/category-resolver.md): чтение `categories` по (rn, target, is_active) через `@Inject(DATABASE_TOKEN)`, нормализация, таблица синонимов, трёхуровневое сопоставление, кэш `Map` с TTL 5 минут, подавление ошибок чтения
- [X] T006 Зарегистрировать `CategoryResolverService` в `providers` и `exports` в `src/modules/catalog/catalog.module.ts`
- [X] T007 Написать падающие тесты фильтра в `src/modules/catalog/tests/catalog-filters.spec.ts`: `categoryIds` с одним и несколькими значениями, пустой массив и `undefined` = без ограничения по категории, совместная работа с `budgetMax`/`excludedIngredients`
- [X] T008 Заменить в `src/modules/catalog/services/catalog.service.ts` поле `CatalogFilters.categoryId?: string` на `categoryIds?: string[]` и условие `eq(products.categoryId, …)` на `inArray(products.categoryId, …)`, применяемое только при непустом массиве

**Checkpoint**: T002–T008 зелёные; типы ломают сборку во всех местах, где ещё передаётся `categoryId` — это чинится в фазах ниже.

---

## Phase 3: User Story 1 — Вопрос с категорией возвращает товары (Priority: P1) 🎯 MVP

**Goal**: свободный вопрос с упоминанием категории возвращает карточки этой категории.

**Independent Test**: боевой запрос «какие у вас есть роллы» для города с непустым каталогом → ≥1 карточка, все из категории «роллы» (quickstart, шаг 3).

- [X] T009 [US1] Написать падающие тесты в `src/modules/assistant/tests/shortlist-builder.spec.ts`: слот `category` резолвится и уходит в фильтр как `categoryIds`; при `matched: false` фильтр по категории не применяется (а не обнуляет выдачу); остальные слоты (бюджет, ингредиенты, острота) продолжают попадать в фильтр
- [X] T010 [US1] Внедрить `CategoryResolverService` в `ShortlistBuilderService` (`src/modules/assistant/services/shortlist-builder.service.ts`), добавить в сигнатуру `build` использование `rn`/`target` для резолва и заполнять `CatalogFilters.categoryIds`
- [X] T011 [US1] Перевести бонус скоринга в `src/modules/rag/services/hybrid-retriever.service.ts` (`computeScore`) с `filters.categoryId === product.categoryId` на `filters.categoryIds?.includes(product.categoryId)`
- [X] T012 [P] [US1] Обновить `src/modules/rag/tests/hybrid-retriever.spec.ts` под `categoryIds` (бонус начисляется при попадании в список, не начисляется вне его)
- [X] T013 [US1] Прокинуть отображаемое имя категории в отказ: `FallbackService.forEmptyResult` в `src/modules/assistant/services/fallback.service.ts` принимает необязательный `categoryLabel`, `AssistantOrchestratorService` (`src/modules/assistant/services/assistant-orchestrator.service.ts`) передаёт `labels[0]` из резолва, при отсутствии — исходное значение слота
- [X] T014 [P] [US1] Дополнить `src/modules/assistant/tests/fallback.spec.ts`: отказ печатает отображаемое имя категории, а при нерезолвнутой категории — исходный слот (поведение как раньше)
- [X] T015 [US1] Прогнать `pnpm test` и `pnpm lint`; убедиться, что локальный сценарий на сид-данных не деградировал (quickstart, шаг 2)

**Checkpoint**: US1 самодостаточна — вопросы с категорией работают, пресеты ещё могут скрываться.

---

## Phase 4: User Story 2 — Подсказки с категорией снова показываются (Priority: P2)

**Goal**: пресеты с категорией не отфильтровываются при наличии товаров, и нажатие на них даёт карточки.

**Independent Test**: `GET /v1/assistant/suggestions` для города с непустым каталогом → подсказки с категорией присутствуют; выбор подсказки → карточки (quickstart, шаг 3).

- [X] T016 [US2] Написать падающие тесты гейтинга пресетов в `src/modules/suggestions/tests/suggestion-gating.spec.ts`: пресет с историческим слагом `roll` не скрывается, когда в городе есть товары соответствующей категории; скрывается, когда товаров нет; при ошибке резолва показывается (текущее поведение «показать при сбое»)
- [X] T017 [US2] Применить резолв в `SuggestionService.checkProductsExist` (`src/modules/suggestions/services/suggestion.service.ts`): `categoryId: slots.category` → `categoryIds` из `CategoryResolverService`
- [X] T018 [US2] Обеспечить доступность резолвера в `src/modules/suggestions/suggestions.module.ts` — проверено, `CatalogModule` уже импортирован, правок не потребовалось
- [X] T019 [US2] Прогнать `pnpm test`; проверить, что путь `suggestion_id` в оркестраторе использует тот же резолв, что и свободный вопрос (FR-006)

**Checkpoint**: US1 + US2 — обе точки входа в диалог работают.

---

## Phase 5: User Story 3 — Реальные категории каталога для распознавателя (Priority: P3)

**Goal**: ассистент распознаёт категории, которые есть в каталоге, а не фиксированные шесть.

**Independent Test**: вопрос про категорию вне исторического списка, присутствующую в каталоге, → карточки этой категории.

- [X] T020 [US3] Написать падающие тесты в `src/modules/assistant/tests/intent-slot-parser.spec.ts`: `knownCategories` берутся из `listOptions` для (rn, target); при пустом справочнике и при ошибке — исторический список из шести слагов
- [X] T021 [US3] Изменить `IntentSlotParserService.parse` (`src/modules/assistant/services/intent-slot-parser.service.ts`): принимать `rn`/`target` в контексте и подставлять `listOptions` вместо зашитого массива; исторический список вынести в именованную константу, используемую как откат
- [X] T022 [US3] Передать `rn` в вызов парсера из `AssistantOrchestratorService` (`src/modules/assistant/services/assistant-orchestrator.service.ts`); `target` уже передаётся
- [X] T023 [US3] Прогнать `pnpm test`; убедиться, что размер промпта ограничен (не более 40 категорий)

**Checkpoint**: все три истории реализованы.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T024 Интеграционный тест в `test/integration/category-filter.test.ts`: каталог, где `products.category_id` ≠ слагу (как на проде), вопрос с категорией → непустая выдача только нужной категории; вопрос с несуществующей категорией → выдача без жёсткого отказа
- [X] T025 [P] Прогнать `pnpm lint` и `pnpm test:coverage`, убедиться в отсутствии падений и необработанных типов `categoryId`
- [X] T026 [P] Добавить запись в [docs/knowledge/decisions.md](../../docs/knowledge/decisions.md) о разрешении категории через справочник `categories` и о том, почему фильтр стал множественным
- [X] T027 Боевая проверка по [quickstart.md](./quickstart.md), шаги 3–4 — выполнена 2026-10-01 на прод-стенде, результаты ниже

## Результат боевой проверки (2026-10-01)

| Сообщение | До фикса | После |
|-----------|----------|-------|
| «какие у вас есть роллы» | 0, `(из категории roll)` | **5 карточек**, все роллы |
| «покажи все роллы» | 0 | **5 карточек** |
| «роллы до 500 рублей» | 0 | **5 карточек**, 319–479 ₽ |
| «покажи сеты» / «сеты» | 0 | **3 карточки**, все сеты |
| «что есть с лососем» | 5 карточек | 5 карточек (регрессии нет) |
| «фывапролдж» | — | ответ без жёсткого отказа по категории |
| подсказки | пресета с категорией не было | `company_set` (category `set`) в списке |

Слоты от LLM теперь несут реальные слаги каталога (`rolly`, `nabory`) — US3 подтверждена по `ai_logs`.

Открытый дефект, **вне объёма этой спеки**: «подбери сет на компанию» по-прежнему возвращает 0. Причина другая — LLM копирует весь список `knownIngredients` в `preferred_ingredients`, а `CatalogService.findByCity` применяет его как жёсткий фильтр с точным сравнением элементов, тогда как в боевых данных `ingredients` сета — это строки состава целиком («Ролл Филадельфия лайт сяке (8 шт.)»). Нужна отдельная спека: предпочтения должны влиять на ранжирование, а не отсекать выдачу.

Замечание по SC-005: время ответа на запросы с категорией выросло (было ~3 с на пустой отказ, стало 10–14 с) — это не деградация, а другой путь выполнения: раньше запрос обрывался до LLM-реранка, теперь проходит полный конвейер, как и запросы без категории (9–10 с до фикса).

---

## Dependencies

```text
Phase 1 (T001)
  └─> Phase 2 (T002…T008)   ← блокирует всё
        ├─> Phase 3 US1 (T009…T015)        [MVP]
        ├─> Phase 4 US2 (T016…T019)        зависит только от Phase 2
        └─> Phase 5 US3 (T020…T023)        зависит только от Phase 2
              └─> Phase 6 (T024…T027)
```

- US1, US2, US3 между собой независимы: после Phase 2 их можно вести параллельно.
- T027 выполняется последней — только после выката на прод.

## Parallel Execution Examples

- Phase 2: T003 и T004 параллельны (разные кейсы одного тестового файла — писать в один заход), T007 параллелен им (другой файл).
- Phase 3: T012 и T014 параллельны друг другу (разные тестовые файлы), оба после T011/T013 соответственно.
- После Phase 2: три исполнителя могут взять US1, US2 и US3 одновременно.
- Phase 6: T025 и T026 параллельны.

## Implementation Strategy

- **MVP**: Phase 1 + Phase 2 + Phase 3 (US1). Это снимает основной дефект — вопросы с категорией перестают возвращать ложный отказ.
- **Инкремент 2**: Phase 4 (US2) — возвращает пресеты с категорией в выдачу подсказок.
- **Инкремент 3**: Phase 5 (US3) — снимает зависимость от зашитого списка категорий.
- Каждый инкремент выкатывается отдельно и проверяется по своему сценарию из quickstart.
