#!/bin/bash
set -e
cd /home/deploy/ai-assistant

if [ -f aihelper_deploy.tar ]; then
  tar xf aihelper_deploy.tar
  rm -f aihelper_deploy.tar
fi

rm -f docker/nginx/conf.d/mshelper.conf

docker builder prune -f || true

echo "Building app image..."
docker compose -f docker-compose.prod.yml build app

echo "Starting postgres..."
docker compose -f docker-compose.prod.yml up -d postgres

echo "Waiting for postgres..."
sleep 8

echo "Starting app and nginx..."
docker compose -f docker-compose.prod.yml up -d app nginx

echo "Waiting for app..."
sleep 5

echo "Running migrations..."
docker compose -f docker-compose.prod.yml exec -T app node dist/src/database/migrate.js

echo "Health check..."
curl -sf http://localhost/health || curl -sf http://127.0.0.1:3000/health || true

docker compose -f docker-compose.prod.yml ps
