# AI Product Assistant — Sushi Delivery

Backend prototype of an AI assistant that answers questions about sushi delivery products.

## Stack

| Layer           | Technology               |
| --------------- | ------------------------ |
| Runtime         | Node.js 20+, TypeScript  |
| Framework       | NestJS 10 + Fastify      |
| Database        | PostgreSQL 15 + pgvector |
| ORM             | Drizzle ORM              |
| Test            | Vitest                   |
| Package manager | pnpm                     |

## Quick Start

### 1. Start PostgreSQL

```bash
docker-compose up -d
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env — DATABASE_URL must point to running Postgres
```

### 4. Run migrations

```bash
pnpm db:migrate
```

### 5. Seed data

```bash
pnpm db:seed
```

### 6. Start the service

```bash
pnpm start:dev
```

Service starts at **http://localhost:3000**.
Swagger UI: **http://localhost:3000/docs**

---

## API Endpoints

### Health

```bash
curl http://localhost:3000/health
```

### Ask about products

```bash
curl -X POST http://localhost:3000/v1/assistant/product-answer \
  -H "Content-Type: application/json" \
  -d '{
    "city_id": "test_city",
    "user_message": "Хочу роллы с лососем до 1000 рублей",
    "target": "WEB"
  }'
```

Response:

```json
{
  "reply_text": "Для вас подобрал роллы с лососем в указанном бюджете.",
  "cards": [
    {
      "product_id": "...",
      "name": "Ролл с лососем",
      "price": 890,
      "reason": "Свежий лосось, доступная цена"
    }
  ],
  "quick_replies": [],
  "actions": [],
  "need_clarification": false,
  "metadata": {
    "session_id": "...",
    "request_id": "...",
    "validation_passed": true,
    "fallback_used": false,
    "sources": ["rag"],
    "latency_ms": 42
  }
}
```

### Get preset suggestions

```bash
curl "http://localhost:3000/v1/assistant/suggestions?rn=$RN&br=$BR&target=WEB&screen_context=catalog&session_id=visit-9f3c"
```

Returns a **set** of up to `MAX_SUGGESTIONS_ON_SCREEN` (6 by default), not the whole catalogue:

- `screen_context` — `catalog` (default), `cart`, `checkout`, `empty`. Add-ons dominate the cart, service questions the checkout and an empty screen; an unknown value is treated as `catalog`.
- `session_id` — optional. The same value returns the same set during the visit, different values rotate it. Without it the set is still valid, only not stable.
- each element carries `kind`: `product` (answers with cards) or `service` (answers with text from the city knowledge base).

Service suggestions are hidden in cities whose information pages have not been imported (`pnpm site:import`).

### Trigger a suggestion

There is no separate trigger endpoint — post the suggestion's `id` to the answer endpoint:

```bash
curl -X POST http://localhost:3000/v1/assistant/product-answer \
  -H "Content-Type: application/json" \
  -d '{
    "rn": "'$RN'",
    "br": "'$BR'",
    "target": "WEB",
    "session_id": "visit-9f3c",
    "suggestion_id": "<id from the list above>"
  }'
```

### Import cities (dry-run)

```bash
curl -X POST http://localhost:3000/v1/internal/import/cities \
  -H "Content-Type: application/json" \
  -H "x-internal-api-key: $INTERNAL_API_KEY" \
  -d '{
    "rn": "A79C5050-1EE7-11EB-9B6E-05B5FC40DF2A",
    "dry_run": true
  }'
```

### Import products

```bash
curl -X POST http://localhost:3000/v1/internal/import/products \
  -H "Content-Type: application/json" \
  -H "x-internal-api-key: $INTERNAL_API_KEY" \
  -d '{
    "rn": "A79C5050-1EE7-11EB-9B6E-05B5FC40DF2A",
    "br": "11111111-1111-1111-1111-111111111111",
    "target": "WEB",
    "mode": "full"
  }'
```

---

## Environment Variables

| Variable               | Default | Description                        |
| ---------------------- | ------- | ---------------------------------- |
| `DATABASE_URL`         | —       | PostgreSQL connection string       |
| `PORT`                 | `3000`  | HTTP port                          |
| `LLM_PROVIDER`         | `mock`  | `mock` or `openai`                 |
| `EMBEDDING_PROVIDER`   | `mock`  | `mock` or `openai`                 |
| `CATALOG_API_BASE_URL` | —       | Products API base URL              |
| `CITIES_API_BASE_URL`  | —       | Cities API base URL                |
| `OPENAI_API_KEY`       | —       | Required if using OpenAI providers |

See `.env.example` for full list.

---

## Development

```bash
# Run unit tests
pnpm test

# Run with coverage
pnpm test:cov

# Lint
pnpm lint

# Format
pnpm format

# Generate new migration after schema changes
pnpm db:generate

# Open Drizzle Studio
pnpm db:studio
```

---

## Architecture

```
src/
├── common/          # Shared filters, interceptors, DTOs
├── config/          # Env validation (Zod)
├── database/        # Drizzle ORM setup, schema, migrations
├── healthcheck/     # GET /health
└── modules/
    ├── catalog-import/   # City & product import from external API
    ├── catalog/          # Product lookup & filtering
    ├── rag/              # Searchable text, embeddings, vector search
    ├── assistant/        # Main pipeline: intent → shortlist → LLM → validate
    ├── suggestions/      # Preset prompts with payloads
    ├── analytics/        # Event logging
    └── admin-config/     # Rules, banned phrases, priority products
```

---

## Site knowledge base (service questions)

Questions about delivery, payment, bonuses, promotions, restaurant addresses and the company are answered from the informational pages of the city site (`<city>.sushi-master.ru`). The pages are client-rendered, so they are collected with a headless browser into a snapshot that lives in the repo and is then imported into the database:

```bash
# on a workstation with Edge/Chrome installed
pnpm site:crawl --url https://tyumen.sushi-master.ru --rn <rn> --br <br> --out data/site-pages/tyumen.json
# anywhere the database is reachable (no browser needed)
pnpm site:import data/site-pages/tyumen.json
```

Without an imported snapshot such questions get the old "I only help with products" reply. Details: [specs/011-site-info-knowledge/quickstart.md](specs/011-site-info-knowledge/quickstart.md).

## LLM / Embedding Providers

Set via environment variables — no code changes needed:

```env
LLM_PROVIDER=mock       # uses MockLLMProvider (no API key required)
LLM_PROVIDER=openai     # uses OpenAILLMProvider (requires OPENAI_API_KEY)

EMBEDDING_PROVIDER=mock    # uses MockEmbeddingProvider
EMBEDDING_PROVIDER=openai  # uses OpenAIEmbeddingProvider
```
