import assert from "node:assert/strict";
import test from "node:test";
import worker, { type WorkerEnv } from "../src/index.ts";

const minimalEnv = {
  ASSETS: { fetch: async () => new Response("static asset", { status: 200 }) },
} as unknown as WorkerEnv;

test("health endpoint responds without accessing credentials or database", async () => {
  const response = await worker.fetch(new Request("https://pantry.test/api/health"), minimalEnv);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok", service: "pantrynext" });
});

test("unknown API routes return JSON 404", async () => {
  const response = await worker.fetch(new Request("https://pantry.test/api/not-a-route"), minimalEnv);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Not found." });
});

test("non-API paths are served from the assets binding", async () => {
  const response = await worker.fetch(new Request("https://pantry.test/"), minimalEnv);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "static asset");
});

test("organization registration rejects missing/invalid fields before external calls", async () => {
  const cases: Array<[Record<string, string>, RegExp]> = [
    [{ organizationName: "Food pantry", email: "admin@example.org", password: "long-enough-password", timezone: "Not/AZone" }, /time zone/i],
    [{ organizationName: "", email: "admin@example.org", password: "long-enough-password", timezone: "America/Chicago" }, /organization name/i],
    [{ organizationName: "Food pantry", email: "not-email", password: "long-enough-password", timezone: "America/Chicago" }, /email/i],
    [{ organizationName: "Food pantry", email: "admin@example.org", password: "short", timezone: "America/Chicago" }, /password/i],
  ];

  for (const [body, message] of cases) {
    const response = await worker.fetch(
      new Request("https://pantry.test/api/register", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://pantry.test" },
        body: JSON.stringify(body),
      }),
      minimalEnv,
    );
    assert.equal(response.status, 400);
    const responseBody = await response.json() as { error: string };
    assert.match(responseBody.error, message);
  }
});

const authEnv = {
  ...minimalEnv,
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_PUBLISHABLE_KEY: "test-key",
};

test("successful login preserves both session cookies", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    access_token: "access-token",
    refresh_token: "refresh-token",
    expires_in: 3600,
    user: { id: "00000000-0000-0000-0000-000000000001", email: "admin@example.org" },
  }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const response = await worker.fetch(
      new Request("https://pantry.test/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://pantry.test" },
        body: JSON.stringify({ email: "admin@example.org", password: "long-enough-password" }),
      }),
      authEnv,
    );
    assert.equal(response.status, 200);
    const cookies = response.headers.getSetCookie();
    assert.equal(cookies.length, 2);
    assert.match(cookies[0], /^pantry_access=access-token;/);
    assert.match(cookies[1], /^pantry_refresh=refresh-token;/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("registration reports an Auth signup failure without touching the database", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("signup failed", { status: 400 });
  try {
    const response = await worker.fetch(
      new Request("https://pantry.test/api/register", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://pantry.test" },
        body: JSON.stringify({
          organizationName: "Food pantry",
          email: "admin@example.org",
          password: "long-enough-password",
          timezone: "America/Chicago",
        }),
      }),
      authEnv,
    );
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      error: "Registration could not be completed. Check the details or sign in if you already have an account.",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("registration reports when Auth requires account verification", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    user: { id: "00000000-0000-0000-0000-000000000001" },
  }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const response = await worker.fetch(
      new Request("https://pantry.test/api/register", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://pantry.test" },
        body: JSON.stringify({
          organizationName: "Food pantry",
          email: "admin@example.org",
          password: "long-enough-password",
          timezone: "America/Chicago",
        }),
      }),
      authEnv,
    );
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      error: "Registration needs account verification before setup can continue.",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("cross-origin and origin-less browser writes are rejected", async () => {
  const crossOrigin = await worker.fetch(
    new Request("https://pantry.test/api/register", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://attacker.test" },
      body: JSON.stringify({}),
    }),
    minimalEnv,
  );
  assert.equal(crossOrigin.status, 403);

  const noOrigin = await worker.fetch(
    new Request("https://pantry.test/api/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }),
    minimalEnv,
  );
  assert.equal(noOrigin.status, 403);
});

test("platform organizations endpoint requires an authenticated session", async () => {
  const response = await worker.fetch(
    new Request("https://pantry.test/api/platform/organizations"),
    minimalEnv,
  );
  assert.equal(response.status, 401);
});
