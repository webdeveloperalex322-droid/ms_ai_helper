ALTER TABLE "categories" DROP CONSTRAINT "categories_rn_br_target_cat_uniq";--> statement-breakpoint
DROP INDEX "categories_lookup_idx";--> statement-breakpoint
CREATE INDEX "categories_lookup_idx" ON "categories" USING btree ("rn","target","is_active");--> statement-breakpoint
-- Categories are now network-global per (rn, target). Collapse pre-existing per-city
-- duplicates (keep the most recently imported row per rn/target/slug) before adding the constraint.
DELETE FROM "categories" a
USING "categories" b
WHERE a."rn" = b."rn"
  AND a."target" = b."target"
  AND a."slug" = b."slug"
  AND (a."imported_at", a."id") < (b."imported_at", b."id");--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_rn_target_slug_uniq" UNIQUE("rn","target","slug");