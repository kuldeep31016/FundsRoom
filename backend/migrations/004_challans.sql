-- 004_challans.sql
-- Sales challan header, line items (with product snapshots) and the number sequence.

-- ---------------------------------------------------------------------------
-- challan_number_sequences
--
-- Challan numbers are generated per year via an atomic UPDATE ... RETURNING on a
-- single row, which serialises concurrent writers without a table scan or a
-- read-then-write race. Format: CH-<year>-<6 digits>, e.g. CH-2026-000123.
-- ---------------------------------------------------------------------------
CREATE TABLE challan_number_sequences (
  prefix      text PRIMARY KEY,
  last_number integer     NOT NULL DEFAULT 0 CHECK (last_number >= 0),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE challans (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challan_number      text           NOT NULL,
  customer_id         uuid           NOT NULL REFERENCES customers (id) ON DELETE RESTRICT,
  status              challan_status NOT NULL DEFAULT 'DRAFT',
  -- Denormalised roll-ups maintained inside the same transaction as the items,
  -- so list screens never need to aggregate child rows.
  total_quantity      integer        NOT NULL DEFAULT 0 CHECK (total_quantity >= 0),
  total_amount        numeric(14,2)  NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  notes               text,
  created_by          uuid           REFERENCES users (id) ON DELETE SET NULL,
  confirmed_by        uuid           REFERENCES users (id) ON DELETE SET NULL,
  confirmed_at        timestamptz,
  cancelled_by        uuid           REFERENCES users (id) ON DELETE SET NULL,
  cancelled_at        timestamptz,
  cancellation_reason text,
  created_at          timestamptz    NOT NULL DEFAULT now(),
  updated_at          timestamptz    NOT NULL DEFAULT now(),

  CONSTRAINT challans_confirmed_fields_chk
    CHECK ((status <> 'CONFIRMED') OR (confirmed_at IS NOT NULL)),
  CONSTRAINT challans_cancelled_fields_chk
    CHECK ((status <> 'CANCELLED') OR (cancelled_at IS NOT NULL))
);

CREATE UNIQUE INDEX challans_challan_number_key ON challans (challan_number);
CREATE INDEX challans_customer_idx   ON challans (customer_id, created_at DESC);
CREATE INDEX challans_status_idx     ON challans (status);
CREATE INDEX challans_created_at_idx ON challans (created_at DESC);
CREATE INDEX challans_created_by_idx ON challans (created_by);

CREATE TRIGGER challans_set_updated_at
  BEFORE UPDATE ON challans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- challan_items
--
-- RULE 5: each line stores a *snapshot* of the product as it was when the challan
-- was raised (name, SKU, category, unit price). product_id is kept purely as a
-- reference for drill-down and stock posting — renaming or repricing a product
-- later never rewrites historical documents.
-- ---------------------------------------------------------------------------
CREATE TABLE challan_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challan_id       uuid          NOT NULL REFERENCES challans (id) ON DELETE CASCADE,
  product_id       uuid          NOT NULL REFERENCES products (id) ON DELETE RESTRICT,

  -- Snapshot columns (immutable once written).
  product_name     text          NOT NULL,
  product_sku      text          NOT NULL,
  product_category text,
  product_location text,
  unit_price       numeric(12,2) NOT NULL CHECK (unit_price >= 0),

  quantity         integer       NOT NULL CHECK (quantity > 0),
  line_total       numeric(14,2) GENERATED ALWAYS AS (unit_price * quantity) STORED,
  created_at       timestamptz   NOT NULL DEFAULT now()
);

-- A product may appear at most once per challan; quantities are merged instead.
CREATE UNIQUE INDEX challan_items_challan_product_key ON challan_items (challan_id, product_id);
CREATE INDEX challan_items_product_idx ON challan_items (product_id);
