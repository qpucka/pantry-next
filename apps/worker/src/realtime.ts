const CHANGE_EVENT = JSON.stringify({ type: "changed" });
const NOTIFICATION_PATH = "/internal/publish";

export interface RealtimeNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

export interface RealtimeContext {
  getWebSockets(): WebSocket[];
  acceptWebSocket(socket: WebSocket): void;
}

export class OrganizationRealtimeRoom {
  private readonly ctx: RealtimeContext;

  constructor(ctx: RealtimeContext) {
    this.ctx = ctx;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === NOTIFICATION_PATH && request.method === "POST") {
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

  webSocketMessage(socket: WebSocket): void {
    try {
      socket.close(1008, "Read-only notification connection");
    } catch {
      // The socket may already be closed.
    }
  }

  webSocketClose(): void {}
}

export async function publishOrganizationChange(namespace: RealtimeNamespace | null | undefined, organizationId: string): Promise<void> {
  if (!namespace || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organizationId ?? "")) {
    throw new Error("Realtime binding and trusted organization UUID are required");
  }
  const stub = namespace.get(namespace.idFromName(organizationId));
  const response = await stub.fetch(`https://realtime.internal${NOTIFICATION_PATH}`, { method: "POST" });
  if (!response.ok) throw new Error(`Realtime notification failed: ${response.status}`);
}
