#!/bin/bash
set -e
cd /home/deploy/ai-assistant

DOMAIN="mshelper.al-developer.ru"
EMAIL="admin@al-developer.ru"

echo "Requesting SSL certificate..."
docker compose -f docker-compose.prod.yml run --rm --entrypoint certbot certbot \
  certonly --webroot \
  --webroot-path=/var/www/certbot \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  -d "$DOMAIN"

echo "Installing HTTPS nginx config..."
cat > docker/nginx/conf.d/mshelper.conf << 'EOF'
server {
    listen 80;
    server_name mshelper.al-developer.ru;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name mshelper.al-developer.ru;

    ssl_certificate     /etc/letsencrypt/live/mshelper.al-developer.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mshelper.al-developer.ru/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;

    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;

    location / {
        proxy_pass http://app:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
EOF

rm -f docker/nginx/conf.d/mshelper-init.conf

docker compose -f docker-compose.prod.yml exec nginx nginx -s reload

echo "Starting certbot renewal service..."
docker compose -f docker-compose.prod.yml up -d certbot

echo "SSL setup complete"
curl -sf "https://$DOMAIN/v1/health" && echo ""
