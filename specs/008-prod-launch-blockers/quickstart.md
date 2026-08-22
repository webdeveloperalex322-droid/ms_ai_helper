# Quickstart: Проверка блокеров продакшен-запуска

**Feature**: [spec.md](./spec.md)

## Предпосылки

```bash
pnpm install
docker-compose up -d        # или локальный Postgres с pgvector
pnpm db:migrate
```

Автотесты: `pnpm test` (юнит), `pnpm lint`, `pnpm build` — зелёные до и после.

## Сценарий 1 — отказ старта на заглушках (US1)

```powershell
$env:NODE_ENV='production'; $env:DATABASE_URL='postgresql://assistant:assistant@localhost:5432/ai_assistant'
pnpm start
```

**Ожидается**: процесс завершается с ненулевым кодом (`$LASTEXITCODE -ne 0`); одно сообщение `Configuration validation error: ...` перечисляет ВСЕ нарушения (`INTERNAL_API_KEY`, `CLIENT_API_KEYS`, `ADMIN_USER`, `ADMIN_PASSWORD`, `ADMIN_COOKIE_SECRET`, `CORS_ALLOWED_ORIGINS`); ни одного фактического значения в выводе.

Повторить, добавив валидные значения всем переменным кроме одной — сообщение называет только её.

## Сценарий 2 — дев-режим не деградирует (US1)

```powershell
Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue
pnpm start:dev
```

**Ожидается**: старт успешен без явных секретов, Swagger доступен на `/v1/docs`.

## Сценарий 3 — все нарушения одним сообщением (US1)

Юнит-тесты: `pnpm vitest run src/config/tests/configuration.spec.ts` — включая случай трёх одновременных нарушений и проверку отсутствия значений в тексте ошибки.

## Сценарий 4 — ротация ключа AITunnel (US2, ручной)

1. Кабинет AITunnel → выпустить новый ключ.
2. Обновить `OPENAI_API_KEY` в окружении сервера (не в git).
3. Отозвать прежний ключ в кабинете.
4. Контроль отзыва: `curl -H "Authorization: Bearer <СТАРЫЙ>" https://api.aitunnel.ru/v1/models` → ошибка авторизации.
5. Контроль нового: запрос `POST /v1/assistant/product-answer` при `LLM_PROVIDER=openai` → успешный ответ.

Зафиксировать выполнение в чек-листе выкатки (автотеста нет — см. [research R9](./research.md#r9-ротация-ключа-aitunnel)).

## Сценарий 5 — внутренняя ошибка не утекает (US3)

Запустить приложение, остановить Postgres, выполнить:

```bash
curl -s -H "x-api-key: <клиентский ключ>" -H "Content-Type: application/json" \
  -d '{"rn":"...","br":"...","target":"WEB","user_message":"что заказать?"}' \
  http://localhost:3000/v1/assistant/product-answer
```

**Ожидается**: тело содержит `error.code=INTERNAL_ERROR` (или fallback-ответ — см. примечание), `error.message="Internal server error"`, `error.requestId`; НЕ содержит текста исключения, адресов подключения, путей. В серверном логе по `requestId` — полная запись со стеком.

Примечание: конвейер ассистента гасит часть сбоев fallback-ответом — для гарантированной проверки фильтра использовать эндпоинт, ходящий в базу напрямую (например, `GET /v1/internal/assistant/suggestions?rn=...` со служебным ключом), либо юнит-тесты `src/common/tests/http-exception.filter.spec.ts`.

Валидация по-прежнему информативна: запрос с пустым телом → 400 `VALIDATION_ERROR` с `details`.

## Сценарий 6 — CORS (US4)

Запуск с `CORS_ALLOWED_ORIGINS=https://shop.example`:

```bash
curl -s -i -X OPTIONS -H "Origin: https://shop.example"  -H "Access-Control-Request-Method: POST" http://localhost:3000/v1/assistant/product-answer | grep -i access-control
curl -s -i -X OPTIONS -H "Origin: https://evil.example" -H "Access-Control-Request-Method: POST" http://localhost:3000/v1/assistant/product-answer | grep -i access-control
```

**Ожидается**: первый ответ содержит `access-control-allow-origin: https://shop.example`; второй — без заголовков разрешения. Продакшен-старт с пустым `CORS_ALLOWED_ORIGINS` — отказ (сценарий 1).

## Сценарий 7 — админ-эндпоинты подсказок (US5)

```bash
# без ключа → 401
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/v1/internal/assistant/suggestions?rn=<uuid>"
# со служебным ключом → 200
curl -s -o /dev/null -w "%{http_code}\n" -H "x-internal-api-key: <ключ>" "http://localhost:3000/v1/internal/assistant/suggestions?rn=<uuid>"
# невалидное тело → 400 VALIDATION_ERROR с details
curl -s -H "x-internal-api-key: <ключ>" -H "Content-Type: application/json" -d '{"code":123}' -X POST "http://localhost:3000/v1/internal/assistant/suggestions"
```

Корректное создание/изменение — как до изменения (регрессия: существующие тесты модуля admin-config зелёные).

## Финальная проверка

```bash
pnpm lint && pnpm build && pnpm test
```

Все команды зелёные; сценарии 1–2 и 4–7 пройдены (4 — вручную, отмечен в чек-листе выкатки).
