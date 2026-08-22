#!/bin/bash
# Issues a Let's Encrypt certificate and switches nginx to HTTPS.
# Run ON THE SERVER, and only once the domain's A record already points here —
# certbot validates over HTTP against this host and fails otherwise.
set -e

APP_DIR="${APP_DIR:-/opt/ai-assistant}"
DOMAIN="${DOMAIN:-mshelper.al-developer.ru}"
EMAIL="${EMAIL:-admin@al-developer.ru}"

cd "$APP_DIR"

echo "Requesting SSL certificate for $DOMAIN..."
docker compose -f docker-compose.prod.yml run --rm --entrypoint certbot certbot \
  certonly --webroot \
  --webroot-path=/var/www/certbot \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  -d "$DOMAIN"

echo "Installing HTTPS nginx config..."
cat > docker/nginx/conf.d/default.conf << EOF
server {
    listen 80 default_server;
    server_name $DOMAIN _;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name $DOMAIN;

    ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;

    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;

    location / {
        proxy_pass http://app:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }
}
EOF

docker compose -f docker-compose.prod.yml exec nginx nginx -s reload

echo "Starting certbot renewal service..."
docker compose -f docker-compose.prod.yml up -d certbot

echo "SSL setup complete"
curl -sf "https://$DOMAIN/v1/health" && echo ""
