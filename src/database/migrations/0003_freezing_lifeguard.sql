CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rn" uuid NOT NULL,
	"br" uuid NOT NULL,
	"target" text NOT NULL,
	"category_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"parent_id" text,
	"order_index" integer,
	"classifier_id" integer,
	"is_default" boolean DEFAULT false NOT NULL,
	"icon_url" text,
	"image_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"raw_payload" jsonb,
	"imported_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "categories_rn_br_target_cat_uniq" UNIQUE("rn","br","target","category_id")
);
--> statement-breakpoint
ALTER TABLE "cities" ADD COLUMN "slug" text;--> statement-breakpoint
CREATE INDEX "categories_lookup_idx" ON "categories" USING btree ("rn","br","target","is_active");