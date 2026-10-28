import assert from "node:assert/strict";
import test from "node:test";
import { OrganizationRealtimeRoom, publishOrganizationChange } from "../src/realtime.ts";
import worker, { type WorkerEnv } from "../src/index.ts";

type MockSocket = {
  send(message: string): void;
  close?(code: number, reason: string): void;
};

type MockPair = [MockSocket, MockSocket] & { closed?: unknown[] };

function roomWithSockets(sockets: MockSocket[] = []): OrganizationRealtimeRoom {
  return new OrganizationRealtimeRoom({
    getWebSockets: () => sockets as unknown as WebSocket[],
    acceptWebSocket: (socket) => sockets.push(socket as unknown as MockSocket),
  });
}

test("Durable Object broadcasts only the generic changed notification", async () => {
  const messages: string[] = [];
  const sockets: MockSocket[] = [
    { send: (message) => messages.push(message) },
    { send: (message) => messages.push(message) },
  ];
  const room = roomWithSockets(sockets);
  const response = await room.fetch(new Request("https://room.internal/internal/publish", { method: "POST" }));
  assert.equal(response.status, 204);
  assert.deepEqual(messages, ['{"type":"changed"}', '{"type":"changed"}']);
});

test("Durable Object accepts WebSocket upgrades and closes client messages", async () => {
  const sockets: MockSocket[] = [];
  const room = roomWithSockets(sockets);
  const runtime = globalThis as typeof globalThis & { WebSocketPair?: () => MockPair };
  const oldPair = runtime.WebSocketPair;
  const pair = [
    { send: () => {} },
    { close: (...args: unknown[]) => { pair.closed = args; } },
  ] as unknown as MockPair;
  runtime.WebSocketPair = function MockWebSocketPair() { return pair; };
  try {
    await assert.rejects(room.fetch(new Request("https://room.internal/connect", {
      headers: { upgrade: "websocket" },
    })), /status.*range|status.*101/i);
    assert.equal(sockets[0], pair[1]);
    room.webSocketMessage(pair[1] as unknown as WebSocket);
    assert.deepEqual(pair.closed, [1008, "Read-only notification connection"]);
  } finally {
    if (oldPair === undefined) delete runtime.WebSocketPair;
    else runtime.WebSocketPair = oldPair;
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
  } as unknown as WorkerEnv;
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
