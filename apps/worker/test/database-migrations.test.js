import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createTenantSchema, registerOrganization } from "../src/database.ts";

const registryFixture = new URL("./fixtures/shared-registry.sql", import.meta.url);

async function setupDatabase() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
  `);
  await db.exec(await readFile(registryFixture, "utf8"));
  return db;
}

async function registerTestOrganization(db, name, ownerUserId) {
  return registerOrganization(db, { name, timezone: "America/Chicago", ownerUserId });
}

test("migrations are repeatable and do not create application functions", async () => {
  const db = await setupDatabase();
  try {
    await db.exec(await readFile(registryFixture, "utf8"));
    const { rows } = await db.query(`
      SELECT routine_name FROM information_schema.routines
       WHERE routine_schema = 'app' AND routine_type = 'FUNCTION'
    `);
    assert.deepEqual(rows, []);
  } finally {
    await db.close();
  }
});

test("Worker registration creates organization, owner membership, and tenant schema transactionally", async () => {
  const db = await setupDatabase();
  try {
    const userId = "00000000-0000-0000-0000-000000000001";
    await db.query("INSERT INTO auth.users VALUES ($1)", [userId]);
    const org = await registerTestOrganization(db, "Queue Pantry", userId);
    assert.match(org.schema_name, /^tenant_[0-9a-f]{32}$/);
    const membership = await db.query(
      "SELECT role FROM app.organization_memberships WHERE organization_id = $1 AND user_id = $2",
      [org.id, userId],
    );
    assert.equal(membership.rows[0].role, "org_admin");
    const tenantTables = await db.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = $1 ORDER BY table_name`,
      [org.schema_name],
    );
    assert.deepEqual(tenantTables.rows.map((row) => row.table_name), ["settings", "waiting_clients"]);
    const setting = await db.query(`SELECT id FROM "${org.schema_name}".settings`);
    assert.equal(setting.rows[0].id, 1);
  } finally {
    await db.close();
  }
});

test("tenant schema builder rejects unsafe names before issuing DDL", async () => {
  const queries = [];
  const client = { query: async (sql) => { queries.push(sql); } };
  await assert.rejects(createTenantSchema(client, 'tenant_x"; DROP SCHEMA app; --'), /Invalid trusted tenant schema/);
  assert.deepEqual(queries, []);
});

test("tenant constraints enforce name, appointment-or-walk-in, and status", async () => {
  const db = await setupDatabase();
  try {
    const userId = "00000000-0000-0000-0000-000000000001";
    await db.query("INSERT INTO auth.users VALUES ($1)", [userId]);
    const org = await registerTestOrganization(db, "Constraints", userId);
    const table = `"${org.schema_name}".waiting_clients`;
    await assert.rejects(db.query(`INSERT INTO ${table} (first_name, appointment_time) VALUES (' ', '13:00')`));
    await assert.rejects(db.query(`INSERT INTO ${table} (first_name) VALUES ('Alex')`));
    await assert.rejects(db.query(`INSERT INTO ${table} (first_name, appointment_time, is_walk_in) VALUES ('Alex', '13:00', true)`));
    await assert.rejects(db.query(`INSERT INTO ${table} (first_name, appointment_time, status) VALUES ('Alex', '13:00', 'waiting')`));

    const { rows } = await db.query(
      `INSERT INTO ${table} (first_name, appointment_time) VALUES ('Alex', '13:00') RETURNING status, is_walk_in, check_in_time`,
    );
    assert.equal(rows[0].status, "checked-in");
    assert.equal(rows[0].is_walk_in, false);
    assert.ok(rows[0].check_in_time);
    const walkin = await db.query(
      `INSERT INTO ${table} (first_name, is_walk_in) VALUES ('Sam', true) RETURNING appointment_time, status`,
    );
    assert.equal(walkin.rows[0].appointment_time, null);
    assert.equal(walkin.rows[0].status, "checked-in");
  } finally {
    await db.close();
  }
});

test("tenant schemas hold separate tenant data", async () => {
  const db = await setupDatabase();
  try {
    const uidA = "00000000-0000-0000-0000-000000000001";
    const uidB = "00000000-0000-0000-0000-000000000002";
    await db.query("INSERT INTO auth.users VALUES ($1), ($2)", [uidA, uidB]);
    const orgA = await registerTestOrganization(db, "A", uidA);
    const orgB = await registerTestOrganization(db, "B", uidB);
    await db.query(`INSERT INTO "${orgA.schema_name}".waiting_clients (first_name, is_walk_in) VALUES ('Alex', true)`);
    const a = await db.query(`SELECT count(*)::int AS count FROM "${orgA.schema_name}".waiting_clients`);
    const b = await db.query(`SELECT count(*)::int AS count FROM "${orgB.schema_name}".waiting_clients`);
    assert.equal(a.rows[0].count, 1);
    assert.equal(b.rows[0].count, 0);
  } finally {
    await db.close();
  }
});

test("registration failure rolls back organization and membership", async () => {
  const db = await setupDatabase();
  try {
    await assert.rejects(registerTestOrganization(db, "Invalid owner", "00000000-0000-0000-0000-000000000001"));
    const orgs = await db.query("SELECT count(*)::int AS count FROM app.organizations");
    const memberships = await db.query("SELECT count(*)::int AS count FROM app.organization_memberships");
    assert.equal(orgs.rows[0].count, 0);
    assert.equal(memberships.rows[0].count, 0);
  } finally {
    await db.close();
  }
});
