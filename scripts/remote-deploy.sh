#!/bin/bash
set -euo pipefail

cd /home/deploy/ai-assistant

if [ -f aihelper_deploy.tar ]; then
  tar xf aihelper_deploy.tar
  rm -f aihelper_deploy.tar
fi

docker builder prune -f || true

echo "Building app image..."
docker compose -f docker-compose.prod.yml build app

echo "Starting services..."
docker compose -f docker-compose.prod.yml up -d postgres
sleep 5
docker compose -f docker-compose.prod.yml up -d app nginx certbot

echo "Waiting for app..."
sleep 5

echo "Running migrations..."
docker compose -f docker-compose.prod.yml exec -T app node dist/src/database/migrate.js

echo "Health check..."
curl -sf http://localhost/v1/health || curl -sf https://localhost/v1/health -k || exit 1
echo ""

docker compose -f docker-compose.prod.yml ps
