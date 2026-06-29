# Деплой на production

## Вариант 1: одна команда с локальной машины (Windows)

```powershell
.\scripts\deploy.ps1
```

Скрипт:
1. собирает `pnpm build`
2. упаковывает `dist` + Docker-файлы
3. загружает на сервер по SSH
4. пересобирает контейнер, применяет миграции, проверяет `/v1/health`

Параметры (опционально):

```powershell
.\scripts\deploy.ps1 -Server deploy@31.128.45.9 -Key C:\Users\Smile\.ssh\video_private
```

---

## Вариант 2: автодеплой через GitHub Actions

При каждом `push` в `main` (или вручную через Actions → Run workflow).

### Настройка (один раз)

В репозитории GitHub: **Settings → Secrets and variables → Actions** → добавить:

| Secret | Значение |
|---|---|
| `DEPLOY_HOST` | `31.128.45.9` |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_SSH_KEY` | содержимое приватного ключа `video_private` |

Файл `.env.prod` хранится только на сервере в `/home/deploy/ai-assistant/.env.prod` — в git не коммитится.

### Запуск вручную

GitHub → Actions → **Deploy to production** → **Run workflow**

---

## Что происходит на сервере

Скрипт `scripts/remote-deploy.sh`:
- распаковывает архив
- `docker compose build app`
- `docker compose up -d`
- `node dist/src/database/migrate.js`
- health check

Проект: `/home/deploy/ai-assistant`
