# Tasks: Блокеры продакшен-запуска — валидация секретов, утечка ошибок, CORS, админ-контур

**Input**: Design documents from `/specs/008-prod-launch-blockers/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: Включены — SC-001–SC-003, SC-005, SC-007 спеки прямо требуют автотестового подтверждения; порядок — тест падает до реализации.

**Organization**: Задачи сгруппированы по историям спеки; каждая история проверяется независимо.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: разные файлы, нет зависимостей от незавершённых задач — можно параллельно
- **[Story]**: US1–US5 из spec.md

## Phase 1: Setup

Не требуется: проект инициализирован, новых зависимостей нет ([plan.md](./plan.md) → Technical Context). Единственный новый каталог `src/modules/admin-config/dto/` создаётся задачей T014.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Общий механизм накопления нарушений конфигурации — на нём стоят US1 и US4.

- [x] T001 Перевести `validateConfig` на накопление нарушений в `src/config/configuration.ts`: все прикладные проверки (OPENAI_API_KEY при провайдере `openai`, парсинг и непустота `CLIENT_API_KEYS`) складывают строки в массив; в конце один `throw` с сообщением `Configuration validation error: <нарушения через '; '>`; существующие формулировки сохраняются ([research R1](./research.md#r1-где-живёт-продакшен-валидация-секретов), [contracts/startup-validation.md](./contracts/startup-validation.md))
- [x] T002 Добавить `CORS_ALLOWED_ORIGINS: z.string().default('')` в zod-схему и производное поле `corsAllowedOrigins: string[]` в `AppConfig` в `src/config/configuration.ts` с нормализацией: trim, отбрасывание пустых записей, удаление завершающего `/`, схема и хост в нижний регистр ([data-model §2](./data-model.md#2-cors_allowed_origins--corsallowedorigins))

**Checkpoint**: `pnpm test` зелёный — существующие тесты конфигурации не сломаны; фундамент готов.

---

## Phase 3: User Story 1 — Отказ старта на небезопасной конфигурации (Priority: P1) 🎯 MVP

**Goal**: Продакшен не стартует на заглушках, слабых и незаданных секретах; все нарушения — одним сообщением без значений; сбой старта — ненулевой код завершения; env-файлы пополнены.

**Independent Test**: Сценарии 1–3 [quickstart.md](./quickstart.md): прод-старт с каждой испорченной переменной падает, dev-старт без секретов работает, юнит-тесты зелёные.

### Tests for User Story 1 (write first, must fail)

- [x] T003 [P] [US1] Юнит-тесты продакшен-валидации в `src/config/tests/configuration.spec.ts`: по каждой переменной [перечня](./data-model.md#1-критичный-секрет) — негативные случаи «не задана» / «заглушка» (все значения чёрного списка, включая `change-this-in-production` и `replace-with-at-least-32-char-random-secret-here`) / «короче минимума» (где применим); дубликаты меток и значений `CLIENT_API_KEYS`; несколько одновременных нарушений перечисляются все; сообщение не содержит фактических/ожидаемых значений; контрольный успешный старт `NODE_ENV=development` без явных секретов (SC-001, SC-002, SC-003)

### Implementation for User Story 1

- [x] T004 [US1] Реализовать блок `NODE_ENV === 'production'` в `validateConfig` в `src/config/configuration.ts`: проверки «не задана явно» / «совпадает с заглушкой» / «короче минимума» по [data-model §1](./data-model.md#1-критичный-секрет); формулировки — по [contracts/startup-validation.md](./contracts/startup-validation.md); дефолты zod-схемы сохраняются (FR-001–FR-003, FR-005, FR-006)
- [x] T005 [US1] Реализовать там же проверку дубликатов `CLIENT_API_KEYS` по метке и по значению с адресацией `entries #i and #j` (FR-004)
- [x] T006 [US1] Добавить `bootstrap().catch()` в `src/main.ts`: лог ошибки и `process.exit(1)`; запасной `console.error`, если Nest-логгер недоступен (FR-007, [research R3](./research.md#r3-завершение-процесса-при-сбое-старта))
- [x] T007 [P] [US1] Пополнить `.env.example`: все переменные схемы, включая `CORS_ALLOWED_ORIGINS`; для секретов — заведомо непригодные местозаполнители с пояснением, что продакшен их отвергнет (FR-008)
- [x] T008 [P] [US1] Пополнить `.env.prod`: добавить `ADMIN_USER`, `ADMIN_PASSWORD`, `ADMIN_COOKIE_SECRET`, `CLIENT_API_KEYS`, `CORS_ALLOWED_ORIGINS`; заменить `INTERNAL_API_KEY=change-this-in-production` на явно непригодный местозаполнитель с комментарием об обязательной замене при выкатке (FR-008, [research R2](./research.md#r2-перечень-заглушек-репозиторий-содержит-больше-значений-чем-007-data-model-6))
- [x] T009 [US1] Прогнать сценарии 1–3 [quickstart.md](./quickstart.md): прод-старт падает с перечнем всех нарушений и ненулевым кодом, dev-старт успешен, `pnpm vitest run src/config/tests/configuration.spec.ts` зелёный

**Checkpoint**: US1 полностью проверяема — продакшен на заглушках невозможен.

---

## Phase 4: User Story 2 — Ротация ключа LLM-провайдера (Priority: P1)

**Goal**: Скомпрометированный ключ AITunnel заменён и отозван; отзыв подтверждён.

**Independent Test**: Сценарий 4 [quickstart.md](./quickstart.md) — старый ключ отвергается провайдером, новый работает.

### Implementation for User Story 2 (ручные операции оператора, кода нет)

- [ ] T010 [US2] Выпустить новый ключ в кабинете AITunnel, обновить `OPENAI_API_KEY` в окружении сервера (вне git), отозвать прежний ключ ([quickstart сценарий 4](./quickstart.md#сценарий-4--ротация-ключа-aitunnel-us2-ручной), шаги 1–3) (FR-009)
- [ ] T011 [US2] Подтвердить отзыв: контрольный запрос со **старым** ключом к `https://api.aitunnel.ru/v1/models` → отказ провайдера; контрольный запрос через приложение с новым ключом → успех; зафиксировать в чек-листе выкатки (SC-004)

**Checkpoint**: Компрометация закрыта; независимо от остальных историй.

---

## Phase 5: User Story 3 — Внутренние ошибки не утекают клиенту (Priority: P2)

**Goal**: Тело ответа при не-`HttpException` — обобщённое сообщение + `error.requestId`; полная запись со стеком и тем же requestId — в серверном логе; валидация и прочие `HttpException` не меняются.

**Independent Test**: Сценарий 5 [quickstart.md](./quickstart.md) + дополненные юнит-тесты фильтра.

### Tests for User Story 3 (write first, must fail)

- [x] T012 [P] [US3] Дополнить `src/common/tests/http-exception.filter.spec.ts`: не-`HttpException` → тело без `exception.message`, с `message='Internal server error'` и `error.requestId` из `(request as any).requestId`; `logger.error` получает requestId, исходное сообщение и стек; исключение без проставленного requestId → поле опущено, текст обобщённый; сбой самого `logger.error` (мок бросает исключение) → тело ответа клиенту не меняется и не обогащается деталями; `VALIDATION_ERROR` и `TOO_MANY_REQUESTS` — без изменений (SC-005, [contracts/error-response.md](./contracts/error-response.md))

### Implementation for User Story 3

- [x] T013 [US3] Править `src/common/filters/http-exception.filter.ts`: в ветви `exception instanceof Error` клиентское `message` — фиксированное `'Internal server error'`; `error.requestId` добавляется во все ветви ответа, когда проставлен интерцептором; вызов `logger.error` (дополненный requestId) обёрнут так, чтобы его сбой не прерывал формирование и отправку ответа клиенту (FR-010–FR-012, [research R4](./research.md#r4-requestid-в-теле-ответа-об-ошибке), [R5](./research.md#r5-обобщённое-сообщение-вместо-exceptionmessage))

**Checkpoint**: US3 проверяема юнит-тестами и сценарием 5; независима от US1/US2.

---

## Phase 6: User Story 4 — Браузерный доступ только с разрешённых источников (Priority: P2)

**Goal**: CORS ограничен списком из конфигурации; прод с пустым списком не стартует; dev без списка работает как раньше.

**Independent Test**: Сценарий 6 [quickstart.md](./quickstart.md) + юнит-тесты конфигурации.

### Tests for User Story 4 (write first, must fail)

- [x] T014 [P] [US4] Дополнить `src/config/tests/configuration.spec.ts`: нормализация `CORS_ALLOWED_ORIGINS` (пробелы, завершающий `/`, регистр схемы/хоста, пустые записи); продакшен с пустым/незаданным списком → нарушение в общем сообщении; development с пустым списком → старт успешен (SC-006)

### Implementation for User Story 4

- [x] T015 [US4] Добавить в продакшен-блок `validateConfig` (`src/config/configuration.ts`) нарушение `CORS_ALLOWED_ORIGINS must list at least one origin in production` при пустом `corsAllowedOrigins` (FR-014)
- [x] T016 [US4] Заменить `app.enableCors()` в `src/main.ts`: непустой `corsAllowedOrigins` → `app.enableCors({ origin: [...] })` в любом режиме; пустой в development/test → текущее разрешение всех источников; читать через `bootConfig` (FR-013, [research R6](./research.md#r6-cors-источник-списка-и-семантика-режимов))
- [x] T017 [US4] Прогнать сценарий 6 [quickstart.md](./quickstart.md): источник из списка получает заголовки разрешения, сторонний — нет

**Checkpoint**: US4 проверяема; зависит только от Phase 2 (T002).

---

## Phase 7: User Story 5 — Админ-эндпоинты подсказок: декларативная защита + DTO (Priority: P2)

**Goal**: `SuggestionAdminController` защищён `@InternalRoute()` через глобальный `AccessKeyGuard`; тела create/update типизированы и валидируются.

**Independent Test**: Сценарий 7 [quickstart.md](./quickstart.md) + тесты модуля admin-config.

### Tests for User Story 5 (write first, must fail)

- [x] T018 [P] [US5] Тесты в `src/modules/admin-config/tests/suggestion-admin.controller.spec.ts`: метаданные scope `internal` на всех трёх обработчиках (обращение без ключа отклоняется гардом); create/update с полем неверного типа → `VALIDATION_ERROR` с `details`; лишнее поле отбрасывается whitelist-политикой; корректные тела проходят без изменений поведения (SC-007, [contracts/suggestion-admin-api.md](./contracts/suggestion-admin-api.md))

### Implementation for User Story 5

- [x] T019 [P] [US5] Создать DTO в `src/modules/admin-config/dto/create-suggestion.dto.ts`: `CreateSuggestionDto` + вложенные `SuggestionPayloadDto`, `SuggestionSlotsDto`, `AvailabilityRulesDto`, `FallbackPayloadDto` — class-validator (`@ValidateNested`, `@Type`) и `@nestjs/swagger`-декораторы, поля по [data-model §4](./data-model.md#4-dto-подсказок-admin-config) (FR-016)
- [x] T020 [US5] Создать `src/modules/admin-config/dto/update-suggestion.dto.ts`: `UpdateSuggestionDto extends PartialType(CreateSuggestionDto)` (FR-016)
- [x] T021 [US5] Править `src/modules/admin-config/controllers/suggestion-admin.controller.ts`: `@InternalRoute()` на `findAll`/`create`/`update`; удалить `checkAuth`, параметры `@Headers('x-internal-api-key')` и инъекцию `ConfigService`; типизировать `@Body()` новыми DTO; сервисный слой не трогать (FR-015, [research R7](./research.md#r7-декларативная-защита-админ-эндпоинтов-подсказок))
- [x] T022 [US5] Прогнать сценарий 7 [quickstart.md](./quickstart.md): 401 без ключа, 200 со служебным, 400 на невалидном теле; существующие тесты модуля admin-config зелёные

**Checkpoint**: Все истории независимо проверяемы.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [x] T023 Прогнать `pnpm lint && pnpm build && pnpm test` — всё зелёное; финальная проверка [quickstart.md](./quickstart.md) (сценарий 4 — отметка в чек-листе выкатки)
- [x] T024 [P] Отметить в `specs/007-prod-security-hardening/tasks.md` задачи, закрытые этой фичей (T036–T037, T040–T050, T059–T061, T066–T067; T051–T052 остаются открытыми до фактической ротации), со ссылкой на `008-prod-launch-blockers`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 2 (Foundational)**: блокирует US1 (T004 строится на накоплении T001) и US4 (T015 требует T002); T001 → T002 последовательно (один файл).
- **US1 (Phase 3)**: после Phase 2. Внутри: T003 (тесты) → T004 → T005 (один файл, последовательно); T006, T007, T008 — параллельно с T004/T005; T009 — последней.
- **US2 (Phase 4)**: независима от кода; выполняется оператором в любой момент до выкатки.
- **US3 (Phase 5)**: независима от Phase 2; T012 → T013.
- **US4 (Phase 6)**: после T002 (+T004 для общего сообщения); T014 → T015 → T016 → T017. T015 и T004/T005 — один файл: выполнять после US1 либо в одной сессии.
- **US5 (Phase 7)**: независима от Phase 2; T018, T019 параллельно → T020 → T021 → T022.
- **Phase 8**: после всех историй.

### Parallel Opportunities

- После Phase 2: US3 (T012–T013), US5 (T018–T021) и US2 (T010–T011) полностью параллельны US1.
- Внутри US1: T007, T008 (env-файлы) параллельны правкам кода.
- Тестовые задачи T003, T012, T014, T018 — разные файлы, параллельны между собой.
- Один файл `configuration.ts` трогают T001, T002, T004, T005, T015 — их не распараллеливать.

---

## Implementation Strategy

**MVP = Phase 2 + US1**: после T009 продакшен физически не стартует на заглушках — главный блокер снят. Далее инкрементально: US3 → US4 → US5 (каждая — независимый деплой-инкремент), US2 — операторская, в любой момент до выкатки. Коммит после каждой задачи или логической группы; на каждом checkpoint — `pnpm test`.
