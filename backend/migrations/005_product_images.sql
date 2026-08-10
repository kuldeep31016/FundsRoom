-- 005_product_images.sql
-- Optional product image stored in S3-compatible object storage.

ALTER TABLE products
  -- Object key within the bucket. The bucket name and region live in
  -- configuration, not in the database, so the same rows work against a
  -- different bucket or a migrated CDN without a data rewrite.
  ADD COLUMN image_key       text,
  ADD COLUMN image_mime_type text,
  ADD COLUMN image_size      integer CHECK (image_size IS NULL OR image_size > 0),
  ADD COLUMN image_updated_at timestamptz;

-- An object key belongs to exactly one product, so an orphaned upload can never
-- be silently shared between two rows.
CREATE UNIQUE INDEX products_image_key_key
  ON products (image_key)
  WHERE image_key IS NOT NULL;

-- Either every image column is populated or none of them are.
ALTER TABLE products
  ADD CONSTRAINT products_image_columns_chk
  CHECK (
    (image_key IS NULL AND image_mime_type IS NULL AND image_size IS NULL AND image_updated_at IS NULL)
    OR
    (image_key IS NOT NULL AND image_mime_type IS NOT NULL AND image_size IS NOT NULL AND image_updated_at IS NOT NULL)
  );
