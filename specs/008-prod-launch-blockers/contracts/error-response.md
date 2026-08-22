# Contract: ErrorResponse

**Компонент**: `AllExceptionsFilter` (`src/common/filters/http-exception.filter.ts`). Наследует контракт [007 data-model §7](../../007-prod-security-hardening/data-model.md#7-errorresponse--тело-ответа-об-ошибке).

## Форма тела (все ошибочные ответы)

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Internal server error",
    "requestId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "details": [{ "message": "..." }]
  }
}
```

| Поле | Присутствие | Правило |
|---|---|---|
| `code` | всегда | без изменений |
| `message` | всегда | `HttpException` → как сейчас; иначе → фиксированное `Internal server error` |
| `requestId` | когда проставлен интерцептором | `(request as any).requestId`; отсутствует только для исключений до интерцептора (гарды) |
| `details` | только `VALIDATION_ERROR` | без изменений |

## Запрещённое содержимое (не-HttpException)

Тело ответа MUST NOT содержать: `exception.message`, стек, SQL/фрагменты запросов, пути файловой системы, хосты/учётные данные подключения.

## Серверный лог

`logger.error` при не-HttpException пишет: requestId, `exception.message`, стек — полная запись находится по `requestId` из тела ответа.

## Неизменяемое поведение

- `VALIDATION_ERROR` — код 400 глобального `ValidationPipe`, `details` с перечнем нарушений — без изменений.
- `TOO_MANY_REQUESTS` — собственное контрактное тело — без изменений.
- Прочие `HttpException` — статус и сообщение исключения — без изменений.
