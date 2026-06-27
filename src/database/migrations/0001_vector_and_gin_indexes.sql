-- Migration 0001: HNSW vector index for pgvector + GIN indexes on JSONB columns
-- Requires pgvector >= 0.5.0 for HNSW support

-- HNSW index for cosine similarity search on embeddings
-- m=16 ef_construction=64 are good defaults for 1536-dim vectors
CREATE INDEX IF NOT EXISTS "idx_product_embeddings_hnsw"
  ON "product_embeddings"
  USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

--> statement-breakpoint

-- GIN indexes for fast JSONB containment queries (@>)
CREATE INDEX IF NOT EXISTS "idx_products_tags_gin"
  ON "products"
  USING gin ("tags");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_products_ingredients_gin"
  ON "products"
  USING gin ("ingredients");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_products_allergens_gin"
  ON "products"
  USING gin ("allergens");

--> statement-breakpoint

-- GIN on chunk metadata for JSON path queries
CREATE INDEX IF NOT EXISTS "idx_product_chunks_metadata_gin"
  ON "product_chunks"
  USING gin ("metadata");

--> statement-breakpoint

-- BTree index on products for category filtering
CREATE INDEX IF NOT EXISTS "idx_products_rn_category"
  ON "products"
  USING btree ("rn", "category_id");

--> statement-breakpoint

-- BTree index on city_products for city + target filtering
CREATE INDEX IF NOT EXISTS "idx_city_products_rn_br_target"
  ON "city_products"
  USING btree ("rn", "br", "target");

--> statement-breakpoint

-- BTree on suggestions for ordered listing
CREATE INDEX IF NOT EXISTS "idx_suggestions_sort_order"
  ON "assistant_suggestions"
  USING btree ("rn", "enabled", "sort_order");

--> statement-breakpoint

-- BTree on import_jobs for monitoring recent jobs
CREATE INDEX IF NOT EXISTS "idx_import_jobs_rn_started"
  ON "import_jobs"
  USING btree ("rn", "started_at" DESC);
