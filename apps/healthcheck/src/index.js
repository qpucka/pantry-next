export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method !== "GET") {
      return new Response("Method not allowed\n", {
        status: 405,
        headers: { Allow: "GET", "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    if (url.pathname !== "/health") {
      return new Response("Not found\n", {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    return Response.json({ status: "ok" });
  },
};
