CREATE TABLE "product_attributes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rn" uuid NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"group_name" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"raw_payload" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "product_attributes_rn_ext_id_uniq" UNIQUE("rn","external_id")
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "attributes" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
CREATE INDEX "idx_product_attributes_rn" ON "product_attributes" USING btree ("rn");--> statement-breakpoint
CREATE INDEX "products_attributes_gin_idx" ON "products" USING gin ("attributes");