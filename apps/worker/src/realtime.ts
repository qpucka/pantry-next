const CHANGE_EVENT = JSON.stringify({ type: "changed" });
const NOTIFICATION_PATH = "/internal/publish";

export class OrganizationRealtimeRoom {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === NOTIFICATION_PATH && request.method === "POST") {
      // This endpoint is reached only through the Worker-to-DO binding. Never
      // forward it from a public Worker route.
      for (const socket of this.ctx.getWebSockets()) {
        try {
          socket.send(CHANGE_EVENT);
        } catch {
          // A disconnected socket is removed by the runtime; continue notifying
          // the other clients in this organization room.
        }
      }
      return new Response(null, { status: 204 });
    }

    if (request.method !== "GET" || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket upgrade required", { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(socket) {
    // Clients subscribe to notifications only; they cannot publish into the
    // room or use it as an application-data channel.
    try {
      socket.close(1008, "Read-only notification connection");
    } catch {
      // The socket may already be closed.
    }
  }

  webSocketClose() {}
}

export async function publishOrganizationChange(namespace, organizationId) {
  if (!namespace || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organizationId ?? "")) {
    throw new Error("Realtime binding and trusted organization UUID are required");
  }
  const stub = namespace.get(namespace.idFromName(organizationId));
  const response = await stub.fetch(`https://realtime.internal${NOTIFICATION_PATH}`, { method: "POST" });
  if (!response.ok) throw new Error(`Realtime notification failed: ${response.status}`);
}
