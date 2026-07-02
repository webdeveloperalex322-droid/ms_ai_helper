ALTER TABLE "city_products" DROP CONSTRAINT "city_products_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "product_chunks" DROP CONSTRAINT "product_chunks_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "product_embeddings" DROP CONSTRAINT "product_embeddings_chunk_id_product_chunks_id_fk";
--> statement-breakpoint
ALTER TABLE "city_products" ADD CONSTRAINT "city_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_chunks" ADD CONSTRAINT "product_chunks_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_embeddings" ADD CONSTRAINT "product_embeddings_chunk_id_product_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."product_chunks"("id") ON DELETE cascade ON UPDATE no action;