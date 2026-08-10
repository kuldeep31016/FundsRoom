-- 001_core_and_users.sql
-- Shared helpers, enum types and the users table (authentication + RBAC).

-- gen_random_uuid() is built into PostgreSQL 13+; pgcrypto is only needed on older
-- servers. pg_trgm makes the ILIKE search endpoints index-backed, but some managed
-- providers restrict extension creation, so its absence must not break the migration.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'pg_trgm unavailable (insufficient privilege) - search falls back to sequential scans';
END
$$;

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at honest without trusting application code.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Enum types (status/type handling lives in the database, not just in code)
-- ---------------------------------------------------------------------------
CREATE TYPE user_role          AS ENUM ('ADMIN', 'SALES', 'WAREHOUSE', 'ACCOUNTS');
CREATE TYPE customer_type      AS ENUM ('RETAIL', 'WHOLESALE', 'DISTRIBUTOR');
CREATE TYPE customer_status    AS ENUM ('LEAD', 'ACTIVE', 'INACTIVE');
CREATE TYPE stock_movement_type AS ENUM ('IN', 'OUT');
CREATE TYPE challan_status     AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL CHECK (length(btrim(name)) > 0),
  email         text        NOT NULL CHECK (length(btrim(email)) > 0),
  password_hash text        NOT NULL,
  role          user_role   NOT NULL,
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Email is the login identifier: unique, case-insensitive.
CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));
CREATE INDEX users_role_idx ON users (role);

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
