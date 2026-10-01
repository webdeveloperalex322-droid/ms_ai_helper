# Тестовый чат-клиент для AI Assistant

Одностраничный клиент (vanilla HTML/JS, без сборки и зависимостей) для ручного
тестирования `POST /v1/assistant/product-answer`.

## Запуск

1. Подними backend:
   ```bash
   pnpm start:dev
   ```
   (mock-провайдеры работают без API-ключей).

2. Открой `test-client/index.html` в браузере — двойным кликом (`file://`)
   или через любой статик-сервер, например:
   ```bash
   npx serve test-client
   ```

## Чат на проде

https://mshelper.al-developer.ru/test-chat/ — закрыт Basic Auth в nginx
([docker/nginx/snippets/test-chat.conf](../docker/nginx/snippets/test-chat.conf)).
Логин/пароль — у владельца (`TEST_CHAT_*` в локальном `.env`). Страница шлёт
запросы на `/test-chat/api/*`, nginx подставляет ключ `testchat` и проксирует
в `/v1/*`, поэтому поле X-API-Key в шапке игнорируется.

Серверное состояние в `/opt/ai-assistant/docker/nginx/secrets/` (не в git):
`test-chat.htpasswd` (`openssl passwd -apr1`) и `test-chat-key.conf`
(`set $test_chat_key "<ключ>";`). Сменить пароль: перезаписать htpasswd и
`docker exec ai_assistant_nginx nginx -s reload`.

## Локальный чат против прод-сервера

```bash
pnpm chat:prod
```

Открой http://localhost:8787 и в шапке поставь Base URL `http://localhost:8787/v1`.
Скрипт `serve-prod.mjs` раздаёт `index.html` и проксирует `/v1/*` на
`https://mshelper.al-developer.ru` (переопределяется `PROD_API_URL`, порт —
`CHAT_PORT`). Прокси нужен, потому что CORS прода пускает только прод-домен.
Ключ берётся из `CLIENT_API_KEYS` в `.env.prod` и подставляется в `X-API-Key`
(ключ из шапки игнорируется). Запросы идут в прод: тратят LLM-баланс и пишут `ai_logs`.

## Настройки (шапка, кликом сворачивается)

| Поле      | Назначение                                | Дефолт |
|-----------|-------------------------------------------|--------|
| Base URL  | адрес API (куда идут запросы)             | `http://localhost:4000/v1` (см. `PORT` в `.env`) |
| X-API-Key | клиентский ключ доступа                    | `dev-client-key-change-in-prod` |
| br        | id филиала, от имени которого запрос       | реальный филиал из импорта |
| rn        | retail network                             | `DEFAULT_RN` |
| target    | `WEB` / `MOBILE`                           | `WEB` |

Значения сохраняются в `localStorage` (ключ `ai-assistant-test-client-v2`) —
переживают перезагрузку. Сохранённые значения имеют приоритет над дефолтами,
поэтому после смены дефолтов правь поля в шапке вручную.

## Ключ доступа

Все клиентские роуты (`/assistant/*`) закрыты `AccessKeyGuard` — без заголовка
`X-API-Key` с валидным ключом ответ будет `401 Access denied`. Валидные ключи
задаёт `CLIENT_API_KEYS` в `.env` в формате `label:key` через запятую; если
переменная не задана, действует dev-дефолт `dev-client:dev-client-key-change-in-prod`,
то есть ключ — `dev-client-key-change-in-prod`. Для staged-rollout можно временно
поставить `ACCESS_CONTROL_MODE=observe` — тогда запросы без ключа проходят
и только логируются.

## Возможности

- Чат: свои сообщения справа, ответ ассистента слева.
- Ответ рендерит `reply_text`, карточки товаров (фото/имя/цена/reason),
  `quick_replies` (кликабельные), `clarification_question`, и `debug` (сворачиваемо).
- «Загрузить пресеты» → `GET /assistant/suggestions` → чипы, шлют `suggestion_id`.
- Ошибки сети/CORS/non-2xx показываются красным системным сообщением.

## CORS

Клиент дергает API из браузера, поэтому в `src/main.ts` включён `app.enableCors()`
(dev-удобство). Без него браузер блокирует запрос.

При пустом `CORS_ALLOWED_ORIGINS` разрешены любые origin'ы и любые запрошенные
заголовки, включая `X-API-Key` — это рабочий режим для `file://`. Если в `.env`
задать список origin'ов, `file://` (origin `null`) перестанет проходить: тогда
открывай клиент через статик-сервер и добавляй его адрес в список.
