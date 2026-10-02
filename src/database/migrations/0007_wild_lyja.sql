CREATE TABLE "site_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rn" uuid NOT NULL,
	"br" uuid NOT NULL,
	"url" text NOT NULL,
	"page_key" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	"source" text DEFAULT 'crawler' NOT NULL,
	"fetched_at" timestamp NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "site_pages_rn_br_url_uniq" UNIQUE("rn","br","url")
);
--> statement-breakpoint
CREATE TABLE "site_page_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"rn" uuid NOT NULL,
	"br" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"heading" text,
	"text" text NOT NULL,
	"content_hash" text NOT NULL,
	"embedding_status" text DEFAULT 'pending' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "site_page_chunks_page_index_uniq" UNIQUE("page_id","chunk_index")
);
--> statement-breakpoint
CREATE TABLE "site_page_embeddings" (
	"chunk_id" uuid PRIMARY KEY NOT NULL,
	"embedding" vector(1536),
	"model_name" text NOT NULL,
	"content_hash" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_page_chunks" ADD CONSTRAINT "site_page_chunks_page_id_site_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."site_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_page_embeddings" ADD CONSTRAINT "site_page_embeddings_chunk_id_site_page_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."site_page_chunks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_site_pages_rn_br_active" ON "site_pages" USING btree ("rn","br","is_active");--> statement-breakpoint
CREATE INDEX "idx_site_page_chunks_rn_br_status" ON "site_page_chunks" USING btree ("rn","br","embedding_status");