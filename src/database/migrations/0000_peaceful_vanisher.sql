CREATE TABLE "retail_networks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rn" uuid NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "retail_networks_rn_unique" UNIQUE("rn")
);
--> statement-breakpoint
CREATE TABLE "cities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rn" uuid NOT NULL,
	"br" uuid NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"raw_payload" jsonb,
	"imported_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cities_rn_br_uniq" UNIQUE("rn","br")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rn" uuid NOT NULL,
	"external_product_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category_id" text,
	"category_name" text,
	"description" text,
	"ingredients" jsonb,
	"allergens" jsonb,
	"tags" jsonb,
	"weight" numeric(10, 2),
	"pieces" integer,
	"calories" numeric(10, 2),
	"protein" numeric(10, 2),
	"fat" numeric(10, 2),
	"carbs" numeric(10, 2),
	"image_url" text,
	"raw_payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "products_rn_ext_id_uniq" UNIQUE("rn","external_product_id")
);
--> statement-breakpoint
CREATE TABLE "city_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rn" uuid NOT NULL,
	"br" uuid NOT NULL,
	"target" text NOT NULL,
	"product_id" uuid NOT NULL,
	"price" numeric(10, 2),
	"old_price" numeric(10, 2),
	"currency" text DEFAULT 'RUB',
	"is_available" boolean DEFAULT true NOT NULL,
	"is_valid" boolean DEFAULT true NOT NULL,
	"invalid_reason" text,
	"imported_at" timestamp DEFAULT now() NOT NULL,
	"raw_payload" jsonb,
	CONSTRAINT "city_products_uniq" UNIQUE("rn","br","target","product_id")
);
--> statement-breakpoint
CREATE TABLE "product_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"rn" uuid NOT NULL,
	"br" uuid NOT NULL,
	"target" text NOT NULL,
	"chunk_type" text DEFAULT 'main' NOT NULL,
	"searchable_text" text NOT NULL,
	"metadata" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"embedding_status" text DEFAULT 'pending' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_embeddings" (
	"chunk_id" uuid PRIMARY KEY NOT NULL,
	"embedding" vector(1536),
	"model_name" text NOT NULL,
	"content_hash" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_sessions" (
	"session_id" text PRIMARY KEY NOT NULL,
	"rn" uuid NOT NULL,
	"br" uuid,
	"target" text NOT NULL,
	"dialog_summary" text,
	"last_intent" text,
	"last_constraints" jsonb,
	"expires_at" timestamp NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_logs" (
	"request_id" uuid PRIMARY KEY NOT NULL,
	"session_id" text,
	"rn" uuid,
	"br" uuid,
	"target" text,
	"user_message" text,
	"normalized_message" text,
	"intent" text,
	"slots" jsonb,
	"suggestion_id" uuid,
	"suggestion_code" text,
	"retrieved_product_ids" jsonb,
	"selected_product_ids" jsonb,
	"llm_prompt_version" text,
	"llm_response" jsonb,
	"validation_status" text,
	"fallback_used" boolean DEFAULT false,
	"latency_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rn" uuid NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"emoji" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"screen_context" text DEFAULT 'catalog',
	"target" text DEFAULT 'WEB' NOT NULL,
	"active_from" timestamp,
	"active_to" timestamp,
	"allowed_br" jsonb,
	"payload" jsonb NOT NULL,
	"availability_rules" jsonb NOT NULL,
	"fallback_payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "suggestions_rn_code_uniq" UNIQUE("rn","code")
);
--> statement-breakpoint
CREATE TABLE "assistant_suggestion_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"suggestion_id" uuid,
	"request_id" uuid,
	"session_id" text,
	"rn" uuid NOT NULL,
	"br" uuid,
	"target" text NOT NULL,
	"event_type" text NOT NULL,
	"retrieved_product_ids" jsonb,
	"selected_product_ids" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rn" uuid NOT NULL,
	"br" uuid,
	"target" text DEFAULT 'WEB' NOT NULL,
	"tone" text,
	"max_cards_in_response" integer DEFAULT 5,
	"max_suggestions_on_screen" integer DEFAULT 8,
	"banned_phrases" jsonb,
	"fallback_templates" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_type" text NOT NULL,
	"rn" uuid NOT NULL,
	"br" uuid,
	"target" text,
	"status" text NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"stats" jsonb,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "city_products" ADD CONSTRAINT "city_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_chunks" ADD CONSTRAINT "product_chunks_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_embeddings" ADD CONSTRAINT "product_embeddings_chunk_id_product_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."product_chunks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_suggestion_events" ADD CONSTRAINT "assistant_suggestion_events_suggestion_id_assistant_suggestions_id_fk" FOREIGN KEY ("suggestion_id") REFERENCES "public"."assistant_suggestions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_city_products_availability" ON "city_products" USING btree ("rn","br","target","is_available","is_valid");--> statement-breakpoint
CREATE INDEX "idx_city_products_price" ON "city_products" USING btree ("price");--> statement-breakpoint
CREATE INDEX "idx_product_chunks_product_br" ON "product_chunks" USING btree ("product_id","br");--> statement-breakpoint
CREATE INDEX "idx_product_chunks_embedding_status" ON "product_chunks" USING btree ("embedding_status");--> statement-breakpoint
CREATE INDEX "idx_ai_logs_session" ON "ai_logs" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_ai_logs_created" ON "ai_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_suggestions_rn_enabled" ON "assistant_suggestions" USING btree ("rn","enabled","target");--> statement-breakpoint
CREATE INDEX "idx_suggestion_events_suggestion" ON "assistant_suggestion_events" USING btree ("suggestion_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_suggestion_events_type" ON "assistant_suggestion_events" USING btree ("event_type","created_at");--> statement-breakpoint
CREATE INDEX "idx_import_jobs_status" ON "import_jobs" USING btree ("job_type","status","started_at");