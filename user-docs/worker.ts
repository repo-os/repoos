interface Env {
  ASSETS: Fetcher;
}

const unchangedPaths = new Set(["/llms.txt", "/llms-full.txt", "/sitemap.xml", "/robots.txt"]);

/** Returns true only when Markdown is explicitly acceptable and wins the tie. */
export function prefersMarkdown(accept: string | null): boolean {
  if (!accept || accept.trim() === "*/*") return false;

  const ranges = new Map<string, number>();
  for (const part of accept.split(",")) {
    const [rawType, ...parameters] = part.trim().toLowerCase().split(";");
    if (!rawType) continue;
    const qParameter = parameters.find((parameter) => /^\s*q\s*=/.test(parameter));
    const parsedQ = qParameter ? Number(qParameter.split("=")[1]) : 1;
    const quality = Number.isFinite(parsedQ) ? Math.max(0, Math.min(1, parsedQ)) : 0;
    ranges.set(rawType.trim(), quality);
  }

  const wildcardQ = ranges.get("*/*") ?? 0;
  const markdownQ = ranges.get("text/markdown");
  // A wildcard alone must keep browsers on HTML. It also supplies the fallback
  // quality for HTML when a client explicitly lists Markdown alongside it.
  if (markdownQ === undefined || markdownQ === 0) return false;
  const htmlQ = ranges.get("text/html") ?? wildcardQ;
  return markdownQ >= htmlQ;
}

export function markdownTwinPath(pathname: string): string | null {
  if (unchangedPaths.has(pathname) || pathname.endsWith(".md")) return null;
  // Only clean page routes negotiate. Keep static files and VitePress metadata
  // on the normal asset path.
  if (pathname !== "/" && /\.[^/]+$/.test(pathname)) return null;
  const normalized = pathname === "/" ? "/index" : pathname.replace(/\/+$/, "");
  return `${normalized}.md`;
}

function withVaryAccept(response: Response, cacheControl?: string): Response {
  const headers = new Headers(response.headers);
  const vary = headers.get("Vary");
  if (!vary || !vary.split(",").some((value) => value.trim().toLowerCase() === "accept")) {
    headers.set("Vary", vary ? `${vary}, Accept` : "Accept");
  }
  if (cacheControl) headers.set("Cache-Control", cacheControl);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const twinPath = markdownTwinPath(url.pathname);

    if (
      (request.method === "GET" || request.method === "HEAD") &&
      twinPath &&
      prefersMarkdown(request.headers.get("Accept"))
    ) {
      const twinUrl = new URL(request.url);
      twinUrl.pathname = twinPath;
      const twinRequest = new Request(twinUrl, request);
      const markdown = await env.ASSETS.fetch(twinRequest);
      if (markdown.ok) {
        const headers = new Headers(markdown.headers);
        headers.set("Content-Type", "text/markdown; charset=utf-8");
        // Static asset cache behavior is not documented to vary on request
        // headers. Prevent shared caches from mixing negotiated variants.
        headers.set("Cache-Control", "private, no-store");
        headers.set("Vary", "Accept");
        return new Response(markdown.body, {
          status: markdown.status,
          statusText: markdown.statusText,
          headers,
        });
      }
    }

    const response = await env.ASSETS.fetch(request);
    if (response.headers.get("Content-Type")?.toLowerCase().startsWith("text/html")) {
      return withVaryAccept(response);
    }
    return response;
  },
};
