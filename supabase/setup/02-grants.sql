-- Grant cloudflare_hyperdrive_role the privileges the Worker needs.
--
-- This is one-time setup, not a schema migration. It is applied with
-- `supabase db query` and is safe to re-run; grants are idempotent.
--
-- CONNECT  lets the role open a connection to the database.
-- CREATE   lets the Worker create per-organization tenant schemas at runtime.
--          This is a privileged capability held by the runtime role; see
--          docs/DECISIONS.md.
-- USAGE    on the app schema lets the role address objects inside it.
-- SELECT, INSERT, UPDATE, DELETE on the app tables gives the registry access
--          the Worker needs. No DDL on existing tables is granted.
--
-- Apply this after 00-create-schema.sql: the app schema and its tables must
-- exist before they can be granted on. ON ALL TABLES applies only to tables
-- that exist at the time it runs, so adding a registry table means re-running
-- this file. Tenant schemas created by the Worker at runtime are not covered
-- here; the Worker grants on those tables as it creates them.

BEGIN;

GRANT CONNECT, CREATE ON DATABASE postgres TO cloudflare_hyperdrive_role;

GRANT USAGE ON SCHEMA app TO cloudflare_hyperdrive_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO cloudflare_hyperdrive_role;

COMMIT;
