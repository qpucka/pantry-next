-- Test fixture for the Worker database contract.
-- Production bootstrap remains in supabase/setup/.

CREATE SCHEMA IF NOT EXISTS app;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cloudflare_hyperdrive_role') THEN
    CREATE ROLE cloudflare_hyperdrive_role;
  END IF;
END
$$;

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
  role text NOT NULL DEFAULT 'platform_admin' CHECK (role IN ('platform_owner', 'platform_admin')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.platform_permissions (
  key text PRIMARY KEY,
  description text NOT NULL
);

CREATE TABLE IF NOT EXISTS app.platform_admin_permissions (
  user_id uuid NOT NULL REFERENCES app.platform_admins(user_id) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES app.platform_permissions(key) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission_key)
);

INSERT INTO app.platform_permissions (key, description)
VALUES ('organizations.read', 'View organizations across the PantryNext installation.')
ON CONFLICT (key) DO NOTHING;

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
