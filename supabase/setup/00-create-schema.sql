-- Shared tenant registry, membership, platform administrator, and staff setup
-- credential schema. Keep `app` out of Supabase's exposed API schemas.
--
-- This is one-time setup, not a schema migration. It is applied with
-- `supabase db query`, which does not record what it runs, and it is safe to
-- re-run: every statement here is guarded with IF NOT EXISTS.
--
-- Apply this before 02-grants.sql, which grants on the schema and tables
-- created here. Once these objects exist, later changes to them belong in
-- supabase/migrations as versioned migrations.

BEGIN;

CREATE SCHEMA IF NOT EXISTS app;
REVOKE ALL ON SCHEMA app FROM PUBLIC;
REVOKE ALL ON SCHEMA app FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS app.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  timezone text NOT NULL CHECK (length(btrim(timezone)) > 0),
  schema_name text GENERATED ALWAYS AS ('tenant_' || replace(id::text, '-', '')) STORED UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.organization_memberships (
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('org_admin', 'staff', 'tablet')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS organization_memberships_user_id_idx
  ON app.organization_memberships (user_id, organization_id);

CREATE TABLE IF NOT EXISTS app.platform_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.staff_setup_links (
  token_hash bytea PRIMARY KEY CHECK (octet_length(token_hash) = 32),
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (length(btrim(email)) > 0),
  role text NOT NULL CHECK (role IN ('org_admin', 'staff', 'tablet')),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_by_user_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS staff_setup_links_org_created_idx
  ON app.staff_setup_links (organization_id, created_at DESC);

REVOKE ALL ON ALL TABLES IN SCHEMA app FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA app FROM anon, authenticated;

COMMIT;
