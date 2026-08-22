#!/bin/bash
set -e

APP_DIR="${APP_DIR:-/opt/ai-assistant}"
cd "$APP_DIR"

if [ ! -f .env.prod ]; then
  echo "ERROR: $APP_DIR/.env.prod is missing. It lives only on the server and is never shipped in the archive."
  exit 1
fi

if [ -f aihelper_deploy.tar ]; then
  tar xf aihelper_deploy.tar
  rm -f aihelper_deploy.tar
fi

# Older releases shipped these; nginx now loads a single default.conf and a
# leftover file here would bind :80 twice.
rm -f docker/nginx/conf.d/mshelper.conf docker/nginx/conf.d/mshelper-init.conf

# conf.d is server state, not release state: scripts/enable-ssl.sh rewrites
# default.conf with the certificate paths, and a deploy must not stomp that
# back to plain HTTP. Only seed it on a server that has no config yet.
mkdir -p docker/nginx/conf.d
if [ ! -f docker/nginx/conf.d/default.conf ]; then
  cp docker/nginx/templates/http.conf docker/nginx/conf.d/default.conf
fi

docker builder prune -f || true

echo "Building app image..."
docker compose --env-file .env.prod -f docker-compose.prod.yml build app

echo "Starting postgres..."
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d postgres

echo "Waiting for postgres..."
for i in $(seq 1 30); do
  if docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T postgres pg_isready -U assistant -d ai_assistant >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

echo "Starting app and nginx..."
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d app nginx

echo "Waiting for app..."
sleep 8

echo "Running migrations..."
docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T app node dist/src/database/migrate.js

echo "Health check..."
curl -sf http://localhost/v1/health && echo "" || echo "WARNING: health check failed"

docker compose --env-file .env.prod -f docker-compose.prod.yml ps
