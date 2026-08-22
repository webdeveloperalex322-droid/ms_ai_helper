# Contract: Продакшен-валидация конфигурации на старте

**Функция**: `validateConfig(config)` в `src/config/configuration.ts` — вызывается из `bootstrap()` до создания приложения и как фабрика `ConfigModule`.

## Поведение

### Все режимы (как сейчас)

- zod-схема: типы, форматы, дефолты.
- `OPENAI_API_KEY` обязателен при `LLM_PROVIDER=openai` или `EMBEDDING_PROVIDER=openai`.
- `CLIENT_API_KEYS` парсится в `clientApiKeys: ClientApiKeyEntry[]`; синтаксические ошибки адресуются по позиции записи.
- **Новое**: `CORS_ALLOWED_ORIGINS` парсится в `corsAllowedOrigins: string[]` с нормализацией (trim, без завершающего `/`, схема+хост в нижний регистр).

### Только `NODE_ENV === 'production'` (новый блок)

По каждой переменной из [перечня](../data-model.md#1-критичный-секрет):

| Проверка | Формулировка нарушения (шаблон) |
|---|---|
| Не задана явно (значение пришло из дефолта схемы) | `<VAR> is not set` |
| Совпадает с заглушкой из перечня | `<VAR> matches a known placeholder value` |
| Короче минимума | `<VAR> is shorter than the required minimum length` |
| Дубликат метки в `CLIENT_API_KEYS` | `CLIENT_API_KEYS: entries #i and #j share the same label` |
| Дубликат значения в `CLIENT_API_KEYS` | `CLIENT_API_KEYS: entries #i and #j share the same key value` |
| Пустой `corsAllowedOrigins` | `CORS_ALLOWED_ORIGINS must list at least one origin in production` |

## Форма отказа

- Один `Error`, сообщение начинается с `Configuration validation error:` и перечисляет **все** нарушения (разделитель `; `).
- Сообщение не содержит ни фактических, ни ожидаемых значений секретов.
- `bootstrap().catch(...)` логирует сообщение и завершает процесс: `process.exit(1)`.

## Совместимость

- `NODE_ENV=development` / `test` без явных секретов — старт успешен (текущее поведение).
- Существующие сообщения zod/parseClientApiKeys не переименовываются — тесты, завязанные на текст, продолжают проходить либо правятся точечно.
