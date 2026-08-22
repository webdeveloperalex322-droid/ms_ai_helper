# Implementation Plan: Блокеры продакшен-запуска — валидация секретов, утечка ошибок, CORS, админ-контур

**Branch**: `008-prod-launch-blockers` | **Date**: 2026-07-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-prod-launch-blockers/spec.md`

## Summary

Минимальный набор работ до первого продакшен-запуска, выделенный из 007: (US1) продакшен-блок в `validateConfig` — отказ старта на незаданных/заглушечных/коротких секретах со сбором всех нарушений в одно сообщение без значений, пополнение `.env.example`/`.env.prod`, `bootstrap().catch()` с `process.exit(1)`; (US2) ручная ротация ключа AITunnel с контрольной проверкой отзыва; (US3) фильтр ошибок перестаёт отдавать `exception.message`, добавляет `error.requestId`; (US4) `enableCors()` заменяется списком из новой переменной `CORS_ALLOWED_ORIGINS`, в продакшене пустой список — отказ старта; (US5) `SuggestionAdminController` переводится на `@InternalRoute()` + типизированные DTO. Технический подход зафиксирован в [research.md](./research.md) (R1–R10).

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js >= 22

**Primary Dependencies**: NestJS 10 (Fastify-адаптер), zod (конфигурация), class-validator + class-transformer (DTO), @nestjs/swagger

**Storage**: PostgreSQL 15+ (pgvector) — схема не меняется; затрагивается только чтение конфигурации

**Testing**: Vitest (`src/**/*.spec.ts`); e2e вне объёма (остаётся в 007: T033, T064–T065)

**Target Platform**: Linux-сервер (Docker), разработка на Windows

**Project Type**: web-service (NestJS модульный монолит)

**Performance Goals**: не применимо — изменения на пути старта приложения и формирования ошибок; на горячий путь запроса влияет только выбор CORS-источников (константное сравнение строк)

**Constraints**: обратная совместимость тела ошибки (поля только добавляются); дефолты zod-схемы сохраняются (dev/test стартуют без явных секретов); сервисный слой admin-config не меняется

**Scale/Scope**: ~6 файлов кода (`configuration.ts`, `main.ts`, `http-exception.filter.ts`, `suggestion-admin.controller.ts`, новые DTO, env-файлы) + тесты; одна ручная операция оператора (ротация ключа)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` — незаполненный шаблон, проектных принципов не декларирует. Гейт применяется по конвенциям CLAUDE.md:

- ✅ Весь доступ к env — через zod-схему `configuration.ts` (новая переменная `CORS_ALLOWED_ORIGINS` добавляется в схему).
- ✅ DTO — class-validator + @nestjs/swagger; глобальный `ValidationPipe` с whitelist.
- ✅ БД-схема не меняется — миграции не нужны.
- ✅ Тесты — Vitest, рядом с модулями в `tests/`.
- ✅ Нарушений — нет; Complexity Tracking пуст.

Post-design re-check: пройден — дизайн не добавил новых зависимостей и не тронул запрещённые зоны.

## Project Structure

### Documentation (this feature)

```text
specs/008-prod-launch-blockers/
├── plan.md              # This file
├── research.md          # Phase 0 — решения R1–R10
├── data-model.md        # Phase 1 — секреты, CORS, ErrorResponse, DTO
├── quickstart.md        # Phase 1 — 7 проверочных сценариев
├── contracts/
│   ├── startup-validation.md
│   ├── error-response.md
│   └── suggestion-admin-api.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks — не создаётся этой командой)
```

### Source Code (repository root)

```text
src/
├── main.ts                                   # US1: bootstrap().catch(); US4: enableCors(origin list)
├── config/
│   ├── configuration.ts                      # US1: продакшен-блок, сбор нарушений; US4: CORS_ALLOWED_ORIGINS
│   └── tests/
│       └── configuration.spec.ts             # US1/US4: новые юнит-тесты (каталог уже создан, пуст)
├── common/
│   ├── filters/http-exception.filter.ts      # US3: обобщённое message, requestId
│   └── tests/http-exception.filter.spec.ts   # US3: дополнение существующих тестов
└── modules/admin-config/
    ├── controllers/suggestion-admin.controller.ts  # US5: @InternalRoute(), DTO вместо any
    ├── dto/                                          # US5: новые DTO (каталог создаётся)
    │   ├── create-suggestion.dto.ts
    │   └── update-suggestion.dto.ts
    └── tests/                                        # US5: тесты контроллера/DTO

.env.example                                  # US1: полный перечень переменных, непригодные местозаполнители
.env.prod                                     # US1: + ADMIN_USER, ADMIN_PASSWORD, ADMIN_COOKIE_SECRET, CORS_ALLOWED_ORIGINS
```

**Structure Decision**: Существующий модульный монолит; новых модулей нет. Единственный новый каталог — `src/modules/admin-config/dto/`. US2 (ротация ключа) кода не меняет — фиксируется сценарием 4 quickstart.md в чек-листе выкатки.

## Complexity Tracking

Нарушений гейта нет — таблица не заполняется.
