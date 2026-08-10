-- 003_products_and_stock.sql
-- Product master plus the auditable stock movement ledger.

CREATE TABLE products (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text          NOT NULL CHECK (length(btrim(name)) > 0),
  sku             text          NOT NULL CHECK (sku ~ '^[A-Z0-9][A-Z0-9._-]{1,31}$'),
  category        text          NOT NULL CHECK (length(btrim(category)) > 0),
  unit_price      numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  -- RULE 2: the database itself refuses to hold negative stock, so no code path
  -- (application bug, manual SQL, race) can produce it.
  current_stock   integer       NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
  min_stock_alert integer       NOT NULL DEFAULT 0 CHECK (min_stock_alert >= 0),
  location        text,
  is_active       boolean       NOT NULL DEFAULT true,
  created_by      uuid          REFERENCES users (id) ON DELETE SET NULL,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now()
);

-- SKU is the business key: stored upper-cased by the service layer and unique,
-- so duplicate products cannot be created.
CREATE UNIQUE INDEX products_sku_key ON products (sku);

CREATE INDEX products_category_idx   ON products (category);
CREATE INDEX products_name_lower_idx ON products (lower(name));
CREATE INDEX products_created_at_idx ON products (created_at DESC);
-- Partial index supporting the "low stock" dashboard/filter.
CREATE INDEX products_low_stock_idx  ON products (id) WHERE current_stock <= min_stock_alert;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE INDEX products_name_trgm_idx ON products USING gin (name gin_trgm_ops);
    CREATE INDEX products_sku_trgm_idx  ON products USING gin (sku gin_trgm_ops);
  END IF;
END
$$;

CREATE TRIGGER products_set_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- stock_movements: immutable audit log of every stock change.
--
-- Nothing in the application updates or deletes rows here; each row records the
-- balance before and after so history can be replayed and reconciled.
-- ---------------------------------------------------------------------------
CREATE TABLE stock_movements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      uuid                NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
  movement_type   stock_movement_type NOT NULL,
  -- Magnitude of the change; always positive.
  quantity        integer             NOT NULL CHECK (quantity > 0),
  -- Signed representation (+in / -out) so history sums to the current balance.
  quantity_change integer GENERATED ALWAYS AS
    (CASE WHEN movement_type = 'IN' THEN quantity ELSE -quantity END) STORED,
  stock_before    integer             NOT NULL CHECK (stock_before >= 0),
  stock_after     integer             NOT NULL CHECK (stock_after >= 0),
  reason          text                NOT NULL CHECK (length(btrim(reason)) > 0),
  -- Links a movement back to the document that caused it (e.g. a challan).
  reference_type  text,
  reference_id    uuid,
  created_by      uuid                REFERENCES users (id) ON DELETE SET NULL,
  created_at      timestamptz         NOT NULL DEFAULT now()
);

CREATE INDEX stock_movements_product_idx   ON stock_movements (product_id, created_at DESC);
CREATE INDEX stock_movements_created_at_idx ON stock_movements (created_at DESC);
CREATE INDEX stock_movements_type_idx      ON stock_movements (movement_type);
CREATE INDEX stock_movements_reference_idx ON stock_movements (reference_type, reference_id);
