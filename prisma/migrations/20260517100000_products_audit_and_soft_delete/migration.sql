-- Migration: add audit columns and soft delete to products and product_images
-- Also ensures product_images table exists with full structure

-- ── products: audit + soft delete ─────────────────────────────────────────
ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "created_by"  UUID,
  ADD COLUMN IF NOT EXISTS "updated_by"  UUID,
  ADD COLUMN IF NOT EXISTS "deleted_by"  UUID,
  ADD COLUMN IF NOT EXISTS "deleted_at"  TIMESTAMPTZ;

-- ── product_images: audit columns ─────────────────────────────────────────
ALTER TABLE "product_images"
  ADD COLUMN IF NOT EXISTS "created_by"  UUID,
  ADD COLUMN IF NOT EXISTS "updated_by"  UUID,
  ADD COLUMN IF NOT EXISTS "deleted_by"  UUID,
  ADD COLUMN IF NOT EXISTS "deleted_at"  TIMESTAMPTZ;

-- ── indexes for soft delete queries ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS "idx_products_deleted_at"
  ON "products" ("deleted_at");

CREATE INDEX IF NOT EXISTS "idx_product_images_deleted_at"
  ON "product_images" ("deleted_at");
