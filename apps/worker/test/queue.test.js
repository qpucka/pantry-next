import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  checkInClient,
  clearQueue,
  moveClientToShopping,
  QueueError,
  readQueue,
  resolveMembership,
} from "../src/queue.ts";
import { registerOrganization } from "../src/database.ts";

const migrations = ["20261025110000_shared_registry.sql", "20261025110100_worker_privileges.sql", "20261025110200_worker_registry_access.sql"];
const userA = "00000000-0000-0000-0000-000000000001";
const userB = "00000000-0000-0000-0000-000000000002";

async function setup() {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid primary key);`);
  for (const file of migrations) {
    await db.exec(await readFile(new URL(`../../../supabase/migrations/${file}`, import.meta.url), "utf8"));
  }
  await db.query("INSERT INTO auth.users VALUES ($1), ($2)", [userA, userB]);
  const orgA = await registerOrganization(db, { name: "A", timezone: "America/Chicago", ownerUserId: userA });
  const orgB = await registerOrganization(db, { name: "B", timezone: "America/Chicago", ownerUserId: userB });
  await db.query(`UPDATE "${orgA.schema_name}".settings SET appointment_times = '["09:00", "10:00"]'::jsonb, number_mode = true`);
  return { db, orgA, orgB };
}

test("queue resolves only memberships and orders appointment clients before walk-ins", async () => {
  const { db, orgA, orgB } = await setup();
  try {
    const a = await resolveMembership(db, userA, orgA.id);
    await assert.rejects(resolveMembership(db, userA, orgB.id), (error) => error instanceof QueueError && error.status === 403);
    const walkin = await checkInClient(db, a, { firstName: "Walk-in", isWalkIn: true });
    const later = await checkInClient(db, a, { firstName: "Later", isWalkIn: false, appointmentTime: "10:00" });
    const earlier = await checkInClient(db, a, { firstName: "Earlier", isWalkIn: false, appointmentTime: "09:00" });
    assert.deepEqual([walkin.display_number, later.display_number, earlier.display_number], [1, 2, 3]);
    const queue = await readQueue(db, a);
    assert.deepEqual(queue.clients.map((client) => client.first_name), ["Earlier", "Later", "Walk-in"]);
    const tablet = await readQueue(db, { ...a, role: "tablet" });
    assert.equal("first_name" in tablet.clients[0], false);
    assert.equal(tablet.clients[0].display_number, 3);
  } finally {
    await db.close();
  }
});

test("role permissions allow tablet shopping but restrict check-in and clear", async () => {
  const { db, orgA } = await setup();
  try {
    const membership = await resolveMembership(db, userA, orgA.id);
    const client = await checkInClient(db, membership, { firstName: "Tablet test", isWalkIn: true });
    const tablet = { ...membership, role: "tablet" };
    await assert.rejects(checkInClient(db, tablet, { firstName: "No", isWalkIn: true }), (error) => error.status === 403);
    await assert.rejects(clearQueue(db, tablet, true), (error) => error.status === 403);
    await moveClientToShopping(db, tablet, client.id);
    const queue = await readQueue(db, membership);
    assert.equal(queue.clients.length, 0);
  } finally {
    await db.close();
  }
});

test("clear requires confirmation, deletes all entries, and resets automatic numbers", async () => {
  const { db, orgA } = await setup();
  try {
    const membership = await resolveMembership(db, userA, orgA.id);
    await checkInClient(db, membership, { firstName: "First", isWalkIn: true });
    await assert.rejects(clearQueue(db, membership, false), (error) => error.status === 400);
    assert.equal(await clearQueue(db, membership, true), 1);
    const next = await checkInClient(db, membership, { firstName: "Next", isWalkIn: true });
    assert.equal(next.display_number, 1);
  } finally {
    await db.close();
  }
});

test("check-in rejects appointment times not in organization settings", async () => {
  const { db, orgA } = await setup();
  try {
    const membership = await resolveMembership(db, userA, orgA.id);
    await assert.rejects(
      checkInClient(db, membership, { firstName: "Invalid", appointmentTime: "11:00", isWalkIn: false }),
      (error) => error instanceof QueueError && error.status === 400,
    );
  } finally {
    await db.close();
  }
});
