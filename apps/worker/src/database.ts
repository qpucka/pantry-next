const TENANT_SCHEMA_RE = /^tenant_[0-9a-f]{32}$/;

function quoteTenantSchema(schema) {
  if (!TENANT_SCHEMA_RE.test(schema)) throw new Error("Invalid trusted tenant schema name");
  return `"${schema}"`;
}

export async function createTenantSchema(client, schema) {
  const quoted = quoteTenantSchema(schema);
  await client.query(`CREATE SCHEMA ${quoted}`);
  await client.query(`REVOKE ALL ON SCHEMA ${quoted} FROM PUBLIC`);
  await client.query(`REVOKE ALL ON SCHEMA ${quoted} FROM anon, authenticated`);
  await client.query(`GRANT USAGE ON SCHEMA ${quoted} TO cloudflare_hyperdrive_role`);
  await client.query(`CREATE TABLE ${quoted}.settings (
    id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    appointment_times jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(appointment_times) = 'array'),
    number_mode boolean NOT NULL DEFAULT false,
    next_display_number integer NOT NULL DEFAULT 1 CHECK (next_display_number > 0),
    tv_pairing_secret_hash bytea CHECK (tv_pairing_secret_hash IS NULL OR octet_length(tv_pairing_secret_hash) = 32),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  await client.query(`INSERT INTO ${quoted}.settings (id) VALUES (1)`);
  await client.query(`CREATE TABLE ${quoted}.waiting_clients (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name text NOT NULL CHECK (length(btrim(first_name)) > 0),
    last_name text,
    appointment_time time without time zone,
    is_walk_in boolean NOT NULL DEFAULT false,
    check_in_time timestamptz NOT NULL DEFAULT now(),
    status text NOT NULL DEFAULT 'checked-in' CHECK (status IN ('checked-in', 'shopping')),
    display_number integer CHECK (display_number IS NULL OR display_number > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((is_walk_in AND appointment_time IS NULL) OR (NOT is_walk_in AND appointment_time IS NOT NULL))
  )`);
  await client.query(`CREATE INDEX waiting_clients_queue_idx ON ${quoted}.waiting_clients (status, is_walk_in, appointment_time, check_in_time, id)`);
  await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${quoted}.settings TO cloudflare_hyperdrive_role`);
  await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${quoted}.waiting_clients TO cloudflare_hyperdrive_role`);
}

export async function registerOrganization(client, { name, timezone, ownerUserId }) {
  await client.query("BEGIN");
  try {
    const result = await client.query(
      "INSERT INTO app.organizations (name, timezone) VALUES ($1, $2) RETURNING id, schema_name",
      [name, timezone],
    );
    const rows = result.rows ?? result;
    const organization = rows[0];
    await client.query(
      "INSERT INTO app.organization_memberships (organization_id, user_id, role) VALUES ($1, $2, 'org_admin')",
      [organization.id, ownerUserId],
    );
    await createTenantSchema(client, organization.schema_name);
    await client.query("COMMIT");
    return organization;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
