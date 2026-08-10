-- 002_customers.sql
-- Customer CRM: master record plus an append-only follow-up log.

CREATE TABLE customers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text            NOT NULL CHECK (length(btrim(name)) > 0),
  mobile         text            NOT NULL CHECK (mobile ~ '^[0-9]{10,15}$'),
  email          text,
  business_name  text,
  -- GST number is optional per the specification. When present it must be a valid
  -- 15-character Indian GSTIN and must not collide with another customer.
  gst_number     text            CHECK (gst_number IS NULL OR gst_number ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$'),
  customer_type  customer_type   NOT NULL,
  address        text,
  status         customer_status NOT NULL DEFAULT 'LEAD',
  follow_up_date date,
  notes          text,
  created_by     uuid            REFERENCES users (id) ON DELETE SET NULL,
  created_at     timestamptz     NOT NULL DEFAULT now(),
  updated_at     timestamptz     NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX customers_gst_number_key
  ON customers (upper(gst_number))
  WHERE gst_number IS NOT NULL;

CREATE INDEX customers_status_idx         ON customers (status);
CREATE INDEX customers_type_idx           ON customers (customer_type);
CREATE INDEX customers_follow_up_date_idx ON customers (follow_up_date);
CREATE INDEX customers_created_at_idx     ON customers (created_at DESC);
CREATE INDEX customers_mobile_idx         ON customers (mobile);
CREATE INDEX customers_name_lower_idx     ON customers (lower(name));

-- Trigram indexes accelerate the "search across name/business/mobile/email"
-- endpoint. Only created when pg_trgm is installed (see 001).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE INDEX customers_name_trgm_idx     ON customers USING gin (name gin_trgm_ops);
    CREATE INDEX customers_business_trgm_idx ON customers USING gin (business_name gin_trgm_ops);
  END IF;
END
$$;

CREATE TRIGGER customers_set_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- customer_follow_ups: CRM activity trail. Append-only by design.
-- ---------------------------------------------------------------------------
CREATE TABLE customer_follow_ups (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id    uuid        NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  note           text        NOT NULL CHECK (length(btrim(note)) > 0),
  -- Optional "next contact on" date captured with the note; when supplied the
  -- service also advances customers.follow_up_date.
  follow_up_date date,
  created_by     uuid        REFERENCES users (id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX customer_follow_ups_customer_idx
  ON customer_follow_ups (customer_id, created_at DESC);
