# Contract: Служебные эндпоинты управления подсказками

**Компонент**: `SuggestionAdminController` (`src/modules/admin-config/controllers/suggestion-admin.controller.ts`), база `/{API_PREFIX}/internal/assistant/suggestions`.

## Доступ

Все три эндпоинта помечены `@InternalRoute()` — служебный ключ `x-internal-api-key` проверяется глобальным `AccessKeyGuard`. Ручной `checkAuth` и параметры `@Headers('x-internal-api-key')` в сигнатурах удалены.

| Ситуация | Ответ |
|---|---|
| Без ключа | 401, `error.code` по контракту гарда |
| С клиентским ключом | отказ (клиентский ключ не даёт доступа к scope `internal`) |
| Со служебным ключом | как раньше |

## Эндпоинты

### GET `?rn=<uuid>`

Без изменений (список подсказок сети).

### POST

Тело: `CreateSuggestionDto` ([data-model §4](../data-model.md#4-dto-подсказок-admin-config)). Ответ 201 — созданная запись.

Невалидное тело → 400:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Validation failed", "details": [{ "message": "..." }], "requestId": "..." } }
```

Поля вне DTO отбрасываются глобальной политикой (`whitelist: true`) и в базу не попадают.

### PATCH `/:id`

Тело: `UpdateSuggestionDto` (частичный Create). Ответ 200 — обновлённая запись. Невалидное тело → 400, запись не изменяется.

## Регрессия

Корректные сценарии создания/изменения со служебным ключом ведут себя как до изменения (US5, сценарий 4). Сервисный слой (`SuggestionAdminService`) не меняется.
