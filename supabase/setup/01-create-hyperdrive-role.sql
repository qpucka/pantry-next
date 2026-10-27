-- Create the database login the Cloudflare Worker uses to reach Postgres.
--
-- This is one-time setup, not a schema migration. It is applied with
-- `supabase db query`, which does not record what it runs, and it is safe to
-- re-run: every statement here is idempotent.
--
-- cloudflare_hyperdrive_role is the login Hyperdrive connects with and the
-- role that holds the Worker's privileges. It is the user named in the
-- Hyperdrive origin configuration.
--
-- This is the trusted Worker role. It can reach every organization's data.
-- Tenant authorization is enforced in the Worker by authenticating the user and
-- checking their membership and role; Postgres does not enforce it for this
-- role. See docs/DECISIONS.md.
--
-- PASSWORD: the placeholder in the ALTER ROLE statement below is substituted
-- by the database setup workflow with `envsubst` before this file is applied.
-- The value is the HYPERDRIVE_DB_PASSWORD GitHub environment secret. Applying
-- this file without that substitution sets the literal placeholder text as the
-- password. Because `db query` records nothing, the password is not stored
-- anywhere in the database.
--
-- Rotating the password means updating the secret and re-running this file.
--
-- Privilege grants are in 02-grants.sql.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cloudflare_hyperdrive_role') THEN
    CREATE ROLE cloudflare_hyperdrive_role LOGIN;
  END IF;
END
$$;

ALTER ROLE cloudflare_hyperdrive_role WITH LOGIN PASSWORD '${HYPERDRIVE_DB_PASSWORD}';

COMMIT;
