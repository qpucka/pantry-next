import type { DatabaseClient } from "./database.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SCHEMA_RE = /^tenant_[0-9a-f]{32}$/;

export type MembershipRole = "org_admin" | "staff" | "tablet";

export interface Membership {
  organization_id: string;
  schema_name: string;
  role: MembershipRole;
}

export interface CheckInInput {
  firstName?: unknown;
  lastName?: unknown;
  isWalkIn?: unknown;
  appointmentTime?: unknown;
}

export interface QueueClient {
  id: string;
  first_name: string;
  last_name: string | null;
  appointment_time: string | null;
  is_walk_in: boolean;
  check_in_time: string;
  status: "checked-in" | "shopping";
  display_number: number | null;
}

export interface QueueSettings {
  appointment_times: string[];
  number_mode: boolean;
  next_display_number: number;
}

export class QueueError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "QueueError";
    this.status = status;
  }
}

function tenant(schema: string): string {
  if (!SCHEMA_RE.test(schema)) throw new Error("Invalid trusted tenant schema name");
  return `"${schema}"`;
}

export async function resolveMembership(
  client: DatabaseClient,
  userId: string,
  organizationId: string,
): Promise<Membership> {
  if (!UUID_RE.test(organizationId ?? "")) throw new QueueError(400, "Invalid organization.");
  const { rows } = await client.query<Membership>(
    `SELECT o.id::text AS organization_id, o.schema_name, m.role
       FROM app.organizations o
       JOIN app.organization_memberships m ON m.organization_id = o.id
      WHERE o.id = $1 AND m.user_id = $2`,
    [organizationId, userId],
  );
  const membership = rows[0];
  if (!membership) throw new QueueError(403, "You do not have access to this organization.");
  if (!SCHEMA_RE.test(membership.schema_name)) throw new Error("Invalid tenant schema mapping");
  return membership;
}

function requireRole(membership: Membership, allowed: readonly MembershipRole[]): void {
  if (!allowed.includes(membership.role)) throw new QueueError(403, "Your role cannot perform this action.");
}

export async function readQueue(client: DatabaseClient, membership: Membership): Promise<{
  numberMode: boolean;
  clients: Array<QueueClient | Pick<QueueClient, "id" | "appointment_time" | "is_walk_in" | "status" | "display_number">>;
}> {
  const schema = tenant(membership.schema_name);
  const settingResult = await client.query<{ number_mode: boolean }>(
    `SELECT number_mode FROM ${schema}.settings WHERE id = 1`,
  );
  const numberMode = settingResult.rows[0]?.number_mode ?? false;
  const result = await client.query<QueueClient>(
    `SELECT id, first_name, last_name, appointment_time, is_walk_in,
            check_in_time, status, display_number
       FROM ${schema}.waiting_clients
      WHERE status = 'checked-in'
      ORDER BY is_walk_in ASC, appointment_time ASC NULLS LAST, check_in_time ASC, id ASC`,
  );
  const clients = membership.role === "tablet" && numberMode
    ? result.rows.map(({ id, appointment_time, is_walk_in, status, display_number }) => ({
        id, appointment_time, is_walk_in, status, display_number,
      }))
    : result.rows;
  return { numberMode, clients };
}

export async function checkInClient(
  client: DatabaseClient,
  membership: Membership,
  input: CheckInInput,
): Promise<QueueClient> {
  requireRole(membership, ["org_admin", "staff"]);
  const firstName = typeof input.firstName === "string" ? input.firstName.trim() : "";
  const lastName = typeof input.lastName === "string" ? input.lastName.trim() : null;
  const isWalkIn = input.isWalkIn === true;
  const appointmentTime = input.appointmentTime;
  if (!firstName || firstName.length > 100) throw new QueueError(400, "Enter a first name (100 characters or fewer).");
  if (lastName !== null && lastName.length > 100) throw new QueueError(400, "Last name must be 100 characters or fewer.");
  if (isWalkIn ? appointmentTime !== null && appointmentTime !== undefined : typeof appointmentTime !== "string") {
    throw new QueueError(400, "Choose an appointment time or Walk-in.");
  }
  if (!isWalkIn && typeof appointmentTime === "string" && !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(appointmentTime)) {
    throw new QueueError(400, "Choose a valid appointment time.");
  }

  const schema = tenant(membership.schema_name);
  await client.query("BEGIN");
  try {
    const settingsResult = await client.query<QueueSettings>(
      `SELECT appointment_times, number_mode, next_display_number
         FROM ${schema}.settings WHERE id = 1 FOR UPDATE`,
    );
    const settings = settingsResult.rows[0];
    if (!settings) throw new Error("Organization settings are missing");
    if (!isWalkIn && typeof appointmentTime === "string" && !settings.appointment_times.includes(appointmentTime)) {
      throw new QueueError(400, "That appointment time is not currently configured.");
    }
    const number = settings.number_mode ? settings.next_display_number : null;
    const insertResult = await client.query<QueueClient>(
      `INSERT INTO ${schema}.waiting_clients
         (first_name, last_name, appointment_time, is_walk_in, status, display_number)
       VALUES ($1, $2, $3, $4, 'checked-in', $5)
       RETURNING id, first_name, last_name, appointment_time, is_walk_in,
                 check_in_time, status, display_number`,
      [firstName, lastName || null, isWalkIn ? null : appointmentTime, isWalkIn, number],
    );
    const row = insertResult.rows[0];
    if (!row) throw new Error("Client was not checked in");
    if (number !== null) {
      await client.query(
        `UPDATE ${schema}.settings SET next_display_number = next_display_number + 1,
           updated_at = now() WHERE id = 1`,
      );
    }
    await client.query("COMMIT");
    return row;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function moveClientToShopping(client: DatabaseClient, membership: Membership, clientId: string | null): Promise<void> {
  requireRole(membership, ["org_admin", "staff", "tablet"]);
  if (!UUID_RE.test(clientId ?? "")) throw new QueueError(400, "Invalid client.");
  const schema = tenant(membership.schema_name);
  const updated = await client.query<{ id: string }>(
    `UPDATE ${schema}.waiting_clients
        SET status = 'shopping', updated_at = now()
      WHERE id = $1 AND status = 'checked-in'
      RETURNING id`,
    [clientId],
  );
  if (!updated.rows[0]) throw new QueueError(404, "That client is no longer in the waiting queue.");
}

export async function clearQueue(client: DatabaseClient, membership: Membership, confirmed: boolean): Promise<number> {
  requireRole(membership, ["org_admin", "staff"]);
  if (confirmed !== true) throw new QueueError(400, "Confirm clearing the queue.");
  const schema = tenant(membership.schema_name);
  await client.query("BEGIN");
  try {
    await client.query(`SELECT id FROM ${schema}.settings WHERE id = 1 FOR UPDATE`);
    const deleted = await client.query<{ id: string }>(`DELETE FROM ${schema}.waiting_clients RETURNING id`);
    await client.query(`UPDATE ${schema}.settings SET next_display_number = 1, updated_at = now() WHERE id = 1`);
    await client.query("COMMIT");
    return deleted.rows.length;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
