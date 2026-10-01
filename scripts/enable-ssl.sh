#!/bin/bash
# Issues a Let's Encrypt certificate (if there isn't one yet) and writes the
# HTTPS nginx config.
#
# Run ON THE SERVER. On a host with no certificate yet, the domain's A record
# must already point here — certbot validates over HTTP against this host and
# fails otherwise.
#
# Safe to re-run. Certificate issuance is skipped when a live certificate is
# already present, so this doubles as "re-apply the nginx config" — which is
# how a change to the config below reaches a server that already has TLS.
# remote-deploy.sh deliberately never overwrites conf.d/default.conf, because
# that file is server state; this script is the one thing that rewrites it.
set -e

APP_DIR="${APP_DIR:-/opt/ai-assistant}"
DOMAIN="${DOMAIN:-mshelper.al-developer.ru}"
EMAIL="${EMAIL:-admin@al-developer.ru}"

cd "$APP_DIR"

if [ ! -f .env.prod ]; then
  echo "ERROR: $APP_DIR/.env.prod is missing."
  exit 1
fi

COMPOSE="docker compose --env-file .env.prod -f docker-compose.prod.yml"

# The certificates live in the certbot_certs volume, not on the host, so the
# check has to run inside a container that mounts it.
if $COMPOSE run --rm --entrypoint sh certbot -c \
    "test -f /etc/letsencrypt/live/$DOMAIN/fullchain.pem" 2>/dev/null; then
  echo "Certificate for $DOMAIN already present — skipping issuance."
else
  echo "Requesting SSL certificate for $DOMAIN..."
  $COMPOSE run --rm --entrypoint certbot certbot \
    certonly --webroot \
    --webroot-path=/var/www/certbot \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    -d "$DOMAIN"
fi

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

    # All security headers live at server level, and every location below
    # inherits them. Do not add an add_header to a location: nginx replaces the
    # whole inherited set rather than adding to it, so one add_header in a
    # location silently drops all of these for that route.
    #
    # 'always' matters here — without it these are omitted from 4xx/5xx, which
    # is exactly what a throttled or unauthorised caller receives.
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

    # Password-protected test chat at /test-chat/ (docker/nginx/snippets).
    include /etc/nginx/snippets/*.conf;

    # Brute-force guard for the AdminJS login form. The panel is mounted
    # straight onto the raw Fastify instance and never passes through the
    # application's throttler guard, so this is its only rate limit.
    location = /admin/login {
        limit_req zone=admin_login burst=5 nodelay;

        proxy_pass http://app:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }

    # Flood guard for the endpoint that spends money on LLM calls. Looser than
    # the application's own per-visitor limit on purpose, so the app stays the
    # authority on quota and this only stops what should never reach Node.
    location = /v1/assistant/product-answer {
        limit_req zone=assistant burst=10 nodelay;

        proxy_pass http://app:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }

    location / {
        proxy_pass http://app:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        # Overwrite, never \$proxy_add_x_forwarded_for: that form appends to
        # whatever the client sent, so a caller could prepend any address it
        # liked and the app would read it as the client's own. Overwriting drops
        # the forged part at the edge, leaving exactly one trustworthy entry —
        # which is what trustProxy: 1 in main.ts expects to find.
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }
}
EOF

# Fail loudly on a bad config instead of reloading into a broken state.
echo "Validating nginx config..."
$COMPOSE exec -T nginx nginx -t

$COMPOSE exec -T nginx nginx -s reload

echo "Starting certbot renewal service..."
$COMPOSE up -d certbot

echo "SSL setup complete"
curl -sf "https://$DOMAIN/v1/health" && echo ""
