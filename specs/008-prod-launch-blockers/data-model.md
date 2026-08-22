# Data Model: Блокеры продакшен-запуска

**Feature**: [spec.md](./spec.md) | **Date**: 2026-07-30

Новых таблиц БД нет. Модель — конфигурационные сущности и форма ответа об ошибке.

## 1. Критичный секрет

Проверяется единым блоком `validateConfig` при `NODE_ENV === 'production'`; нарушения копятся и выбрасываются одним сообщением. Расширяет [007 data-model §6](../007-prod-security-hardening/data-model.md#6-перечень-критичных-секретов) заглушками, фактически найденными в файлах окружения репозитория (см. [research R2](./research.md#r2-перечень-заглушек-репозиторий-содержит-больше-значений-чем-007-data-model-6)).

| Переменная | Мин. длина | Отвергаемые заглушки | Особые проверки |
|---|---|---|---|
| `CLIENT_API_KEYS` | 32 на каждый ключ | `dev-client-key-change-in-prod` | обязательна; дубликаты меток и значений между записями — нарушение |
| `INTERNAL_API_KEY` | 32 | `dev-internal-key-change-in-prod`, `change-this-in-production` | — |
| `ADMIN_USER` | — | `admin@example.com` | только отличие от заглушки |
| `ADMIN_PASSWORD` | 12 | `changeme123` | — |
| `ADMIN_COOKIE_SECRET` | 32 | `dev-cookie-secret-replace-in-prod-!!!`, `replace-with-at-least-32-char-random-secret-here` | — |
| `CORS_ALLOWED_ORIGINS` | — | — | в продакшене пустой/незаданный список — нарушение (US4) |

**Инварианты**:
- Сообщение называет переменную и характер нарушения (не задана / заглушка / короче минимума / дубликат / пустой список), никогда не печатает фактическое или ожидаемое значение (FR-005).
- Дефолты остаются в zod-схеме — разработка и тесты стартуют без явных секретов (FR-006).
- Для `CLIENT_API_KEYS` нарушения адресуются по позиции записи (`entry #N`), не по содержимому — как в существующем `parseClientApiKeys`.

## 2. CORS_ALLOWED_ORIGINS → corsAllowedOrigins

| Свойство | Значение |
|---|---|
| Сырой вид | строка, источники через запятую: `https://a.example,https://b.example` |
| Дефолт схемы | `''` (пустой список) |
| Производное поле `AppConfig` | `corsAllowedOrigins: string[]` |
| Нормализация | trim; пустые записи отбрасываются; завершающий `/` удаляется; схема и хост — в нижний регистр |
| Семантика | production: непустой список обязателен, передаётся в CORS как точный перечень; development/test: пустой список = текущее поведение «разрешить всё», непустой = ограничение как в продакшене |

## 3. ErrorResponse — тело ответа об ошибке

Совпадает с контрактом [007 data-model §7](../007-prod-security-hardening/data-model.md#7-errorresponse--тело-ответа-об-ошибке); детали — [contracts/error-response.md](./contracts/error-response.md).

| Поле | Присутствие | Содержимое |
|---|---|---|
| `error.code` | всегда | как сейчас |
| `error.message` | всегда | `HttpException` — как сейчас (FR-012); прочие исключения — фиксированное `Internal server error` без текста исходного исключения (FR-010) |
| `error.details` | только ошибки валидации | как сейчас |
| `error.requestId` | **новое**; во всех ветвях, где идентификатор уже проставлен интерцептором | UUID запроса; связывает ответ с полной записью в серверном логе (FR-011) |

Обратная совместимость: поля только добавляются.

## 4. DTO подсказок (admin-config)

Источник истины — колонки `assistant_suggestions` ([schema](../../src/database/schema/assistant-suggestions.ts)); DTO повторяют `Omit<NewAssistantSuggestion, 'id' | 'createdAt' | 'updatedAt'>`, ожидаемый сервисом.

### CreateSuggestionDto

| Поле | Тип | Обязательность | Валидация |
|---|---|---|---|
| `rn` | string | да | UUID |
| `code` | string | да | непустая строка |
| `title` | string | да | непустая строка |
| `emoji` | string | нет | строка |
| `enabled` | boolean | нет (дефолт БД `true`) | boolean |
| `sortOrder` | number | нет (дефолт БД `100`) | целое |
| `screenContext` | string | нет (дефолт БД `catalog`) | строка |
| `target` | string | нет (дефолт БД `WEB`) | строка |
| `activeFrom` / `activeTo` | Date | нет | ISO-дата |
| `allowedBr` | string[] | нет | массив строк |
| `payload` | SuggestionPayloadDto | да | вложенная валидация |
| `availabilityRules` | AvailabilityRulesDto | да | вложенная валидация |
| `fallbackPayload` | FallbackPayloadDto | нет | вложенная валидация |

### Вложенные DTO

- **SuggestionPayloadDto**: `intent` (строка, обяз.), `slots` (SuggestionSlotsDto, обяз.), `retrieval_query` (строка, обяз.).
- **SuggestionSlotsDto**: все поля опциональны — `category` (строка), `preferred_ingredients`/`excluded_ingredients`/`tags`/`excluded_product_names` (массивы строк), `budget_max` (число | null), `spicy` (boolean | null), `people_count` (число | null), `scenario` (строка).
- **AvailabilityRulesDto**: `check_products_exist` (boolean, обяз.), `min_products_count` (целое, обяз.), `hide_if_empty` (boolean, обяз.), `respect_city_availability` (boolean, обяз.), `respect_price` (boolean, опц.).
- **FallbackPayloadDto**: `reply_text` (строка, обяз.), `quick_replies` (массив строк, обяз.).

### UpdateSuggestionDto

`PartialType(CreateSuggestionDto)` — все поля опциональны, валидация полей сохраняется.

**Инвариант**: глобальный `ValidationPipe` (`whitelist: true`) отбрасывает поля вне DTO; поля неверного типа дают `VALIDATION_ERROR` с перечнем нарушений в `error.details` (FR-016, сценарии US5).
