#!/bin/bash
set -e

DOMAIN="mshelper.al-developer.ru"
APP_DIR="/opt/ai-assistant"
EMAIL="admin@al-developer.ru"

echo "=== AI Assistant Deploy ==="
echo "Domain: $DOMAIN"
echo "App dir: $APP_DIR"

# 1. Prepare directories
mkdir -p "$APP_DIR"
cd "$APP_DIR"

# 2. Install Docker & Docker Compose if not present
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
fi

if ! docker compose version &> /dev/null 2>&1; then
    echo "Installing Docker Compose plugin..."
    apt-get install -y docker-compose-plugin 2>/dev/null || \
    curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
        -o /usr/local/bin/docker-compose && chmod +x /usr/local/bin/docker-compose
fi

echo "Docker: $(docker --version)"

# 3. Start services with init config (HTTP only) to get SSL cert
echo "Starting services (HTTP only for initial cert)..."

# Use init config (HTTP only, no SSL)
cp docker/nginx/conf.d/mshelper-init.conf docker/nginx/conf.d/default.conf
rm -f docker/nginx/conf.d/mshelper.conf

docker compose -f docker-compose.prod.yml up -d postgres nginx app

echo "Waiting for services to start..."
sleep 10

# 4. Obtain SSL certificate
echo "Obtaining SSL certificate for $DOMAIN..."
docker compose -f docker-compose.prod.yml run --rm certbot \
    certbot certonly --webroot \
    --webroot-path=/var/www/certbot \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    -d "$DOMAIN"

# 5. Switch to full HTTPS config
echo "Switching to HTTPS config..."
cp docker/nginx/conf.d/mshelper-init.conf docker/nginx/conf.d/mshelper-init.conf.bak
cat > docker/nginx/conf.d/default.conf << 'NGINX_EOF'
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
NGINX_EOF

docker compose -f docker-compose.prod.yml exec nginx nginx -s reload

# 6. Run DB migrations
echo "Running database migrations..."
docker compose -f docker-compose.prod.yml exec app node -e "
const { migrate } = require('drizzle-orm/node-postgres/migrator');
" 2>/dev/null || \
docker compose -f docker-compose.prod.yml exec app sh -c "NODE_ENV=production node -r tsconfig-paths/register dist/database/migrate.js" 2>/dev/null || \
echo "Migrations may need to be run manually: docker compose -f docker-compose.prod.yml exec app node dist/database/migrate.js"

# 7. Health check
echo "Checking health..."
sleep 5
curl -f "https://$DOMAIN/health" && echo "Health check passed!" || \
curl -f "http://$DOMAIN/health" && echo "Health check passed (HTTP)!"

echo ""
echo "=== Deploy complete! ==="
echo "App: https://$DOMAIN"
echo "Swagger: https://$DOMAIN/docs"
