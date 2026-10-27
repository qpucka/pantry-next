import assert from "node:assert/strict";
import test from "node:test";
import { OrganizationRealtimeRoom, publishOrganizationChange } from "../src/realtime.ts";
import worker from "../src/index.ts";

function roomWithSockets(sockets = []) {
  return new OrganizationRealtimeRoom({
    getWebSockets: () => sockets,
    acceptWebSocket: (socket) => sockets.push(socket),
  });
}

test("Durable Object broadcasts only the generic changed notification", async () => {
  const messages = [];
  const sockets = [
    { send: (message) => messages.push(message) },
    { send: (message) => messages.push(message) },
  ];
  const room = roomWithSockets(sockets);
  const response = await room.fetch(new Request("https://room.internal/internal/publish", { method: "POST" }));
  assert.equal(response.status, 204);
  assert.deepEqual(messages, ['{"type":"changed"}', '{"type":"changed"}']);
});

test("Durable Object accepts WebSocket upgrades and closes client messages", async () => {
  const sockets = [];
  const room = roomWithSockets(sockets);
  const oldPair = globalThis.WebSocketPair;
  const pair = [{ role: "client" }, { role: "server", close: (...args) => { pair.closed = args; } }];
  globalThis.WebSocketPair = function MockWebSocketPair() { return pair; };
  try {
    // Node's built-in Response does not support Cloudflare's 101 + webSocket
    // extension, so the runtime-specific upgrade response throws after accept.
    await assert.rejects(room.fetch(new Request("https://room.internal/connect", {
      headers: { upgrade: "websocket" },
    })), /status.*range|status.*101/i);
    assert.equal(sockets[0], pair[1]);
    room.webSocketMessage(pair[1], "publish something");
    assert.deepEqual(pair.closed, [1008, "Read-only notification connection"]);
  } finally {
    if (oldPair === undefined) delete globalThis.WebSocketPair;
    else globalThis.WebSocketPair = oldPair;
  }
});

test("Durable Object rejects non-upgrades and publish helper requires trusted org ID", async () => {
  const room = roomWithSockets();
  assert.equal((await room.fetch(new Request("https://room.internal/connect"))).status, 426);
  await assert.rejects(publishOrganizationChange(null, "tenant"), /required/);
});

test("realtime route requires same-origin WebSocket and authenticated membership", async () => {
  const env = {
    ASSETS: { fetch: async () => new Response("asset") },
    ORG_REALTIME: {},
  };
  const base = "https://pantry.test/api/organizations/00000000-0000-0000-0000-000000000001/realtime";
  const wrongOrigin = await worker.fetch(new Request(base, {
    headers: { upgrade: "websocket", origin: "https://attacker.test" },
  }), env);
  assert.equal(wrongOrigin.status, 403);

  const noOrigin = await worker.fetch(new Request(base, { headers: { upgrade: "websocket" } }), env);
  assert.equal(noOrigin.status, 403);

  const unauthenticated = await worker.fetch(new Request(base, {
    headers: { upgrade: "websocket", origin: "https://pantry.test" },
  }), env);
  assert.equal(unauthenticated.status, 401);
});
