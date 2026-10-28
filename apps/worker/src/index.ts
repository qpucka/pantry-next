import pg from "pg";
import { registerOrganization as registerOrganizationInDatabase, type DatabaseClient } from "./database.ts";
import { clearQueue, checkInClient, moveClientToShopping, QueueError, readQueue, resolveMembership, type CheckInInput, type Membership } from "./queue.ts";
import { OrganizationRealtimeRoom, publishOrganizationChange, type RealtimeNamespace } from "./realtime.ts";

export { OrganizationRealtimeRoom };

interface WorkerEnv {
  HYPERDRIVE?: { connectionString: string };
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  ORG_REALTIME?: RealtimeNamespace;
  ASSETS: { fetch(request: Request): Promise<Response> };
}

interface AuthUser {
  id: string;
  email?: string;
}

interface SupabaseAuthSession {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  user: { id?: string; email?: string };
}

interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  user: AuthUser;
}

interface AuthContext {
  user: AuthUser;
  refreshedSession: AuthSession | null;
}

interface JsonObject {
  [key: string]: unknown;
}

const { Client } = pg;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ACCESS_COOKIE = "pantry_access";
const REFRESH_COOKIE = "pantry_refresh";
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  });
}

function badRequest(message: string): Response {
  return json({ error: message }, 400);
}

async function withDatabase<T>(env: WorkerEnv, fn: (client: DatabaseClient) => Promise<T>): Promise<T> {
  if (!env.HYPERDRIVE?.connectionString) throw new Error("Database is not configured");
  const client = new Client({
    connectionString: env.HYPERDRIVE.connectionString,
    connectionTimeoutMillis: 5000,
    query_timeout: 10000,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function parseJson(request: Request): Promise<JsonObject | null> {
  try {
    const data: unknown = await request.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    return data as JsonObject;
  } catch {
    return null;
  }
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 320 && EMAIL_RE.test(email) ? email : null;
}

function validTimezone(value: unknown): boolean {
  if (typeof value !== "string" || value.length > 80) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function getCookies(request: Request): Map<string, string> {
  const raw = request.headers.get("cookie") ?? "";
  const cookies = new Map();
  for (const segment of raw.split(";")) {
    const index = segment.indexOf("=");
    if (index <= 0) continue;
    const key = segment.slice(0, index).trim();
    const value = segment.slice(index + 1).trim();
    if (key && value) cookies.set(key, value);
  }
  return cookies;
}

function cookieHeader(name: string, value: string, maxAge: number): string {
  return `${name}=${encodeURIComponent(value)}; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(maxAge))}`;
}

function appendCookies(headers: Headers, session: AuthSession): Headers {
  const maxAge = session.expires_in ?? 3600;
  headers.append("set-cookie", cookieHeader(ACCESS_COOKIE, session.access_token, maxAge));
  headers.append("set-cookie", cookieHeader(REFRESH_COOKIE, session.refresh_token, 60 * 60 * 24 * 30));
  return headers;
}

function sessionHeaders(session: AuthSession): Headers {
  return appendCookies(new Headers({ "cache-control": "no-store" }), session);
}

function clearSessionHeaders() {
  const headers = new Headers({ "cache-control": "no-store" });
  headers.append("set-cookie", cookieHeader(ACCESS_COOKIE, "", 0));
  headers.append("set-cookie", cookieHeader(REFRESH_COOKIE, "", 0));
  return headers;
}

interface AuthRequestOptions {
  method?: string;
  body?: JsonObject;
  accessToken?: string;
}

async function supabaseAuthRequest(
  env: WorkerEnv,
  path: string,
  { method = "GET", body, accessToken }: AuthRequestOptions = {},
): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) throw new Error("Authentication is not configured");
  const headers: Record<string, string> = { apikey: env.SUPABASE_PUBLISHABLE_KEY, "content-type": "application/json" };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  return fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function requestAuthUser(env: WorkerEnv, accessToken: string): Promise<AuthUser | null> {
  const response = await supabaseAuthRequest(env, "/auth/v1/user", { accessToken });
  if (!response.ok) return null;
  const user = await response.json() as Partial<AuthUser>;
  if (!UUID_RE.test(user.id ?? "")) return null;
  return { id: user.id as string, email: user.email };
}

async function requireUser(request: Request, env: WorkerEnv): Promise<AuthContext | null> {
  const cookies = getCookies(request);
  const accessToken = cookies.get(ACCESS_COOKIE);
  if (accessToken) {
    const user = await requestAuthUser(env, accessToken);
    if (user) return { user, refreshedSession: null };
    if (!cookies.has(REFRESH_COOKIE)) return null;
  }

  const refreshToken = cookies.get(REFRESH_COOKIE);
  if (!refreshToken) return null;
  const response = await supabaseAuthRequest(env, "/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    body: { refresh_token: refreshToken },
  });
  if (!response.ok) return null;
  const session = await response.json() as Partial<AuthSession>;
  if (!session.access_token || !session.refresh_token || !session.user) return null;
  const user = await requestAuthUser(env, session.access_token);
  if (!user) return null;
  return { user, refreshedSession: session as AuthSession };
}

async function authenticatePassword(env: WorkerEnv, email: string, password: string): Promise<AuthSession | null> {
  const response = await supabaseAuthRequest(env, "/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password },
  });
  if (!response.ok) return null;
  const session = await response.json() as Partial<AuthSession>;
  if (!session.user || !UUID_RE.test(session.user.id ?? "") || !session.access_token || !session.refresh_token) return null;
  return session as AuthSession;
}

async function registerOrganization(request: Request, env: WorkerEnv): Promise<Response> {
  const body = await parseJson(request);
  if (!body) return badRequest("Request body must be a JSON object.");

  const name = typeof body.organizationName === "string" ? body.organizationName.trim() : "";
  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  const timezone = typeof body.timezone === "string" ? body.timezone : "";

  if (!name || name.length > 160) return badRequest("Enter an organization name (160 characters or fewer).");
  if (!email) return badRequest("Enter a valid email address.");
  if (password.length < 12 || password.length > 128) return badRequest("Password must be between 12 and 128 characters.");
  if (!validTimezone(timezone)) return badRequest("A valid IANA time zone is required.");

  // Supabase Auth confirmations must be disabled in project settings for this
  // no-email flow. This handler refuses confirmation-required signups.
  const signup = await supabaseAuthRequest(env, "/auth/v1/signup", {
    method: "POST",
    body: { email, password },
  });
  if (!signup.ok) {
    return json({ error: "Registration could not be completed. Check the details or sign in if you already have an account." }, 409);
  }
  const session = await signup.json() as Partial<AuthSession>;
  const userId = session.user?.id;
  if (typeof userId !== "string" || !UUID_RE.test(userId) || !session.access_token || !session.refresh_token) {
    return json({ error: "Registration needs account verification before setup can continue." }, 409);
  }

  try {
    const organization = await withDatabase(env, (client) =>
      registerOrganizationInDatabase(client, { name, timezone, ownerUserId: userId }),
    );
    return json({ organizationId: organization.id, organizationName: name }, 201, sessionHeaders(session as AuthSession));
  } catch (error) {
    console.error("Organization provisioning failed", error instanceof Error ? error.message : "unknown error");
    return json({ error: "Your account was created, but organization setup did not complete. Sign in and retry setup." }, 503);
  }
}

async function login(request: Request, env: WorkerEnv): Promise<Response> {
  const body = await parseJson(request);
  if (!body) return badRequest("Request body must be a JSON object.");
  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) return badRequest("Enter your email and password.");
  const session = await authenticatePassword(env, email, password);
  if (!session) return json({ error: "Email or password is incorrect." }, 401);
  return json({ user: { id: session.user.id, email: session.user.email } }, 200, sessionHeaders(session));
}

function authResponse(auth: AuthContext, body: unknown, status = 200): Response {
  const headers = new Headers({ "cache-control": "no-store" });
  if (auth?.refreshedSession) appendCookies(headers, auth.refreshedSession);
  return json(body, status, headers);
}

async function currentMemberships(client: DatabaseClient, userId: string): Promise<Array<Record<string, unknown>>> {
  const result = await client.query(
    `SELECT m.organization_id, m.role, o.name AS organization_name
       FROM app.organization_memberships m
       JOIN app.organizations o ON o.id = m.organization_id
      WHERE m.user_id = $1
      ORDER BY o.name, m.organization_id`,
    [userId],
  );
  return result.rows;
}

async function getCurrentUser(request: Request, env: WorkerEnv): Promise<Response> {
  const auth = await requireUser(request, env);
  if (!auth) return json({ error: "Authentication required." }, 401, clearSessionHeaders());
  return authResponse(auth, { user: { id: auth.user.id, email: auth.user.email } });
}

async function logout(request: Request, env: WorkerEnv): Promise<Response> {
  const accessToken = getCookies(request).get(ACCESS_COOKIE);
  if (accessToken) {
    try {
      await supabaseAuthRequest(env, "/auth/v1/logout", { method: "POST", accessToken });
    } catch {
      // Clear local session even when Supabase Auth is unavailable.
    }
  }
  return json({ ok: true }, 200, clearSessionHeaders());
}

async function listOrganizations(request: Request, env: WorkerEnv): Promise<Response> {
  const auth = await requireUser(request, env);
  if (!auth) return json({ error: "Authentication required." }, 401, clearSessionHeaders());
  return withDatabase(env, async (client) => {
    const isPlatformAdmin = await client.query(
      "SELECT 1 FROM app.platform_admins WHERE user_id = $1",
      [auth.user.id],
    );
    if (isPlatformAdmin.rowCount === 0) return json({ error: "Forbidden." }, 403);
    const result = await client.query(
      "SELECT id, name, timezone, created_at FROM app.organizations ORDER BY created_at DESC, id",
    );
    return authResponse(auth, { organizations: result.rows });
  });
}

type QueueRoute = "read" | "check-in" | "shopping" | "clear";

async function queueApi(
  request: Request,
  env: WorkerEnv,
  route: QueueRoute,
  organizationId: string,
  clientId: string | null = null,
): Promise<Response> {
  const auth = await requireUser(request, env);
  if (!auth) return json({ error: "Authentication required." }, 401, clearSessionHeaders());
  const body = request.method === "GET" ? {} : await parseJson(request);
  if (!body) return badRequest("Request body must be a JSON object.");

  try {
    const result = await withDatabase(env, async (client) => {
      const membership = await resolveMembership(client, auth.user.id, organizationId);
      if (route === "read") return { response: await readQueue(client, membership), changed: false };
      if (route === "check-in") {
        const item = await checkInClient(client, membership, body);
        return { response: { client: item }, changed: true };
      }
      if (route === "shopping") {
        await moveClientToShopping(client, membership, clientId);
        return { response: { ok: true }, changed: true };
      }
      if (route === "clear") {
        const deleted = await clearQueue(client, membership, body.confirm === true);
        return { response: { ok: true, deleted }, changed: true };
      }
      throw new QueueError(404, "Not found.");
    });

    if (result.changed && env.ORG_REALTIME) {
      try {
        await publishOrganizationChange(env.ORG_REALTIME, organizationId);
      } catch (error) {
        // A notification is an optimization; clients refetch on reconnect and
        // after every successful mutation. Do not turn a committed write into
        // an ambiguous failed response that may be retried as a duplicate.
        console.error("Realtime notification failed", error instanceof Error ? error.message : "unknown error");
      }
    }
    return authResponse(auth, result.response);
  } catch (error) {
    if (error instanceof QueueError) return authResponse(auth, { error: error.message }, error.status);
    console.error("Queue request failed", error instanceof Error ? error.message : "unknown error");
    return authResponse(auth, { error: "Queue service is temporarily unavailable." }, 503);
  }
}

async function connectRealtime(request: Request, env: WorkerEnv, organizationId: string): Promise<Response> {
  if (!UUID_RE.test(organizationId)) return badRequest("Invalid organization.");
  const auth = await requireUser(request, env);
  if (!auth) return json({ error: "Authentication required." }, 401, clearSessionHeaders());
  if (!env.ORG_REALTIME) return json({ error: "Live updates are not configured." }, 503);

  // The requested organization is only a selector. Confirm membership and
  // take the canonical ID from the trusted registry before addressing a room.
  const membership = await withDatabase(env, async (client) => client.query<{ organization_id: string }>(
    `SELECT o.id::text AS organization_id
       FROM app.organization_memberships m
       JOIN app.organizations o ON o.id = m.organization_id
      WHERE m.user_id = $1 AND o.id = $2`,
    [auth.user.id, organizationId],
  ));
  const trustedOrganizationId = membership.rows[0]?.organization_id;
  if (typeof trustedOrganizationId !== "string") return json({ error: "Forbidden." }, 403);

  const stub = env.ORG_REALTIME.get(env.ORG_REALTIME.idFromName(trustedOrganizationId));
  const headers = new Headers(request.headers);
  return stub.fetch(new Request("https://realtime.internal/connect", {
    method: "GET",
    headers,
  }));
}

function isTrustedBrowserRequest(request: Request): boolean {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") return false;
  if (origin) {
    try {
      return new URL(origin).origin === url.origin;
    } catch {
      return false;
    }
  }
  // Browser APIs normally send Origin on state-changing fetches. Reject
  // origin-less writes so a cross-site form cannot trigger a cookie-auth write.
  return !["POST", "PUT", "PATCH", "DELETE"].includes(request.method.toUpperCase());
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/") && !isTrustedBrowserRequest(request)) {
      return json({ error: "Cross-origin requests are not allowed." }, 403);
    }

    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({ status: "ok", service: "pantry-next" });
    }
    if (url.pathname === "/api/register" && request.method === "POST") {
      try {
        return await registerOrganization(request, env);
      } catch (error) {
        console.error("Registration request failed", error instanceof Error ? error.message : "unknown error");
        return json({ error: "Registration is temporarily unavailable." }, 503);
      }
    }
    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      try {
        return await login(request, env);
      } catch (error) {
        console.error("Login request failed", error instanceof Error ? error.message : "unknown error");
        return json({ error: "Sign-in is temporarily unavailable." }, 503);
      }
    }
    if (url.pathname === "/api/auth/me" && request.method === "GET") {
      try {
        return await getCurrentUser(request, env);
      } catch (error) {
        console.error("Current session lookup failed", error instanceof Error ? error.message : "unknown error");
        return json({ error: "Sign-in is temporarily unavailable." }, 503);
      }
    }
    if (url.pathname === "/api/auth/logout" && request.method === "POST") return logout(request, env);
    const queueMatch = url.pathname.match(/^\/api\/organizations\/([^/]+)\/queue(?:\/([^/]+)(?:\/(shopping))?)?$/);
    if (queueMatch) {
      const [, organizationId, actionOrClientId, action] = queueMatch;
      if (!actionOrClientId && request.method === "GET") return queueApi(request, env, "read", organizationId);
      if (actionOrClientId === "check-in" && request.method === "POST") return queueApi(request, env, "check-in", organizationId);
      if (actionOrClientId === "clear" && request.method === "POST") return queueApi(request, env, "clear", organizationId);
      if (action === "shopping" && request.method === "POST") return queueApi(request, env, "shopping", organizationId, actionOrClientId);
      return json({ error: "Not found." }, 404);
    }
    const realtimeMatch = url.pathname.match(/^\/api\/organizations\/([^/]+)\/realtime$/);
    if (realtimeMatch && request.method === "GET") {
      try {
        const origin = request.headers.get("origin");
        if (!origin || origin !== url.origin) return json({ error: "WebSocket origin is not allowed." }, 403);
        if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
          return json({ error: "WebSocket upgrade required." }, 426);
        }
        return await connectRealtime(request, env, realtimeMatch[1]);
      } catch (error) {
        console.error("Realtime connection failed", error instanceof Error ? error.message : "unknown error");
        return json({ error: "Live updates are temporarily unavailable." }, 503);
      }
    }
    if (url.pathname === "/api/organizations" && request.method === "GET") {
      try {
        const auth = await requireUser(request, env);
        if (!auth) return json({ error: "Authentication required." }, 401, clearSessionHeaders());
        return await withDatabase(env, async (client) => authResponse(auth, { memberships: await currentMemberships(client, auth.user.id) }));
      } catch (error) {
        console.error("Membership lookup failed", error instanceof Error ? error.message : "unknown error");
        return json({ error: "Organization list is temporarily unavailable." }, 503);
      }
    }
    if (url.pathname === "/api/platform/organizations" && request.method === "GET") {
      try {
        return await listOrganizations(request, env);
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "42501") return json({ error: "Forbidden." }, 403);
        console.error("Platform organization list failed", error instanceof Error ? error.message : "unknown error");
        return json({ error: "Organization list is temporarily unavailable." }, 503);
      }
    }
    if (url.pathname.startsWith("/api/")) return json({ error: "Not found." }, 404);
    return env.ASSETS.fetch(request);
  },
};
