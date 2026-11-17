interface Env {
  UPDATES: R2Bucket;
  REPOOS_HUB_DEV_UPDATE_TOKEN: string;
}

const SECURITY_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);
    if (
      (request.method !== "GET" && request.method !== "HEAD") ||
      parts.length !== 3 ||
      parts[0] !== "dev" ||
      !env.REPOOS_HUB_DEV_UPDATE_TOKEN ||
      parts[1] !== env.REPOOS_HUB_DEV_UPDATE_TOKEN ||
      (parts[2] !== "latest.apk" && parts[2] !== "latest.json")
    ) {
      return new Response("Not found", { status: 404, headers: SECURITY_HEADERS });
    }

    const object = await env.UPDATES.get(parts[2]);
    if (!object) return new Response("Not found", { status: 404, headers: SECURITY_HEADERS });
    const headers = new Headers(SECURITY_HEADERS);
    headers.set(
      "Content-Type",
      parts[2].endsWith(".apk")
        ? "application/vnd.android.package-archive"
        : "application/json; charset=utf-8",
    );
    headers.set("Content-Length", String(object.size));
    if (request.method === "HEAD") return new Response(null, { headers });
    return new Response(object.body, { headers });
  },
};
