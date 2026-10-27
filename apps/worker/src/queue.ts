const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SCHEMA_RE = /^tenant_[0-9a-f]{32}$/;

export class QueueError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function tenant(schema) {
  if (!SCHEMA_RE.test(schema ?? "")) throw new Error("Invalid trusted tenant schema name");
  return `"${schema}"`;
}

export async function resolveMembership(client, userId, organizationId) {
  if (!UUID_RE.test(organizationId ?? "")) throw new QueueError(400, "Invalid organization.");
  const { rows } = await client.query(
    `SELECT o.id::text AS organization_id, o.schema_name, m.role
       FROM app.organizations o
       JOIN app.organization_memberships m ON m.organization_id = o.id
      WHERE o.id = $1 AND m.user_id = $2`,
    [organizationId, userId],
  );
  if (!rows[0]) throw new QueueError(403, "You do not have access to this organization.");
  if (!SCHEMA_RE.test(rows[0].schema_name)) throw new Error("Invalid tenant schema mapping");
  return rows[0];
}

function requireRole(membership, allowed) {
  if (!allowed.includes(membership.role)) throw new QueueError(403, "Your role cannot perform this action.");
}

export async function readQueue(client, membership) {
  const schema = tenant(membership.schema_name);
  const settingResult = await client.query(
    `SELECT number_mode FROM ${schema}.settings WHERE id = 1`,
  );
  const settingRows = settingResult.rows ?? settingResult;
  const numberMode = settingRows[0]?.number_mode ?? false;
  const result = await client.query(
    `SELECT id, first_name, last_name, appointment_time, is_walk_in,
            check_in_time, status, display_number
       FROM ${schema}.waiting_clients
      WHERE status = 'checked-in'
      ORDER BY is_walk_in ASC, appointment_time ASC NULLS LAST, check_in_time ASC, id ASC`,
  );
  const rows = result.rows ?? result;
  const clients = membership.role === "tablet" && numberMode
    ? rows.map(({ id, appointment_time, is_walk_in, status, display_number }) => ({
        id, appointment_time, is_walk_in, status, display_number,
      }))
    : rows;
  return { numberMode, clients };
}

export async function checkInClient(client, membership, input) {
  requireRole(membership, ["org_admin", "staff"]);
  const firstName = typeof input.firstName === "string" ? input.firstName.trim() : "";
  const lastName = typeof input.lastName === "string" ? input.lastName.trim() : null;
  const isWalkIn = input.isWalkIn === true;
  const appointmentTime = input.appointmentTime;
  if (!firstName || firstName.length > 100) throw new QueueError(400, "Enter a first name (100 characters or fewer).");
  if (lastName !== null && (typeof lastName !== "string" || lastName.length > 100)) {
    throw new QueueError(400, "Last name must be 100 characters or fewer.");
  }
  if (isWalkIn ? appointmentTime !== null && appointmentTime !== undefined : typeof appointmentTime !== "string") {
    throw new QueueError(400, "Choose an appointment time or Walk-in.");
  }
  if (!isWalkIn && !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(appointmentTime)) {
    throw new QueueError(400, "Choose a valid appointment time.");
  }

  const schema = tenant(membership.schema_name);
  await client.query("BEGIN");
  try {
    const settingsResult = await client.query(
      `SELECT appointment_times, number_mode, next_display_number
         FROM ${schema}.settings WHERE id = 1 FOR UPDATE`,
    );
    const settings = settingsResult.rows ?? settingsResult;
    if (!settings[0]) throw new Error("Organization settings are missing");
    if (!isWalkIn && !settings[0].appointment_times.includes(appointmentTime)) {
      throw new QueueError(400, "That appointment time is not currently configured.");
    }
    const number = settings[0].number_mode ? settings[0].next_display_number : null;
    const insertResult = await client.query(
      `INSERT INTO ${schema}.waiting_clients
         (first_name, last_name, appointment_time, is_walk_in, status, display_number)
       VALUES ($1, $2, $3, $4, 'checked-in', $5)
       RETURNING id, first_name, last_name, appointment_time, is_walk_in,
                 check_in_time, status, display_number`,
      [firstName, lastName?.trim() || null, isWalkIn ? null : appointmentTime, isWalkIn, number],
    );
    const rows = insertResult.rows ?? insertResult;
    if (number !== null) {
      await client.query(
        `UPDATE ${schema}.settings SET next_display_number = next_display_number + 1,
           updated_at = now() WHERE id = 1`,
      );
    }
    await client.query("COMMIT");
    return rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function moveClientToShopping(client, membership, clientId) {
  requireRole(membership, ["org_admin", "staff", "tablet"]);
  if (!UUID_RE.test(clientId ?? "")) throw new QueueError(400, "Invalid client.");
  const schema = tenant(membership.schema_name);
  const updated = await client.query(
    `UPDATE ${schema}.waiting_clients
        SET status = 'shopping', updated_at = now()
      WHERE id = $1 AND status = 'checked-in'
      RETURNING id`,
    [clientId],
  );
  if (!(updated.rows?.[0] ?? updated[0])) throw new QueueError(404, "That client is no longer in the waiting queue.");
}

export async function clearQueue(client, membership, confirmed) {
  requireRole(membership, ["org_admin", "staff"]);
  if (confirmed !== true) throw new QueueError(400, "Confirm clearing the queue.");
  const schema = tenant(membership.schema_name);
  await client.query("BEGIN");
  try {
    await client.query(`SELECT id FROM ${schema}.settings WHERE id = 1 FOR UPDATE`);
    const deleted = await client.query(`DELETE FROM ${schema}.waiting_clients RETURNING id`);
    const deletedRows = deleted.rows ?? deleted;
    await client.query(
      `UPDATE ${schema}.settings SET next_display_number = 1, updated_at = now() WHERE id = 1`,
    );
    await client.query("COMMIT");
    return deletedRows.length;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
