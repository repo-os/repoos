import { basename } from "node:path";
import type { RouteContext, RouteHandler } from "./types.js";
import { serveStaticUi, UI_MIME } from "./helpers.js";

/** Read the optional repo color from the `c` query param, or null when absent/invalid. */
function colorFromUrl(req: { url?: string }): string | null {
  const url = req.url ? new URL(req.url, "http://localhost") : null;
  const c = url?.searchParams.get("c");
  return c && /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : null;
}

export const serveManifest: RouteHandler = (ctx, req, res) => {
  const { config } = ctx;
  const name = basename(config.root) || "repoos";
  const c = colorFromUrl(req);
  const suffix = c ? `?c=${c}` : "";
  const manifest = JSON.stringify(
    {
      id: "/",
      name: `RepoOS · ${name}`,
      short_name: `RepoOS · ${name}`,
      description: `Repo-native task tracking for ${name}`,
      start_url: "/",
      scope: "/",
      display: "standalone",
      orientation: "portrait-primary",
      background_color: "#070a12",
      theme_color: "#070a12",
      icons: [
        { src: `/icons/icon-192.png${suffix}`, sizes: "192x192", type: "image/png" },
        { src: `/icons/icon-512.png${suffix}`, sizes: "512x512", type: "image/png" },
        { src: `/icons/icon-512.png${suffix}`, sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    null,
    2,
  );
  res.writeHead(200, {
    "Content-Type": "application/manifest+json; charset=utf-8",
    "Cache-Control": "no-cache",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(manifest);
};

export const serveStaticFile: RouteHandler = (ctx, _req, res, params) => {
  const { uiDir } = ctx;
  if (!uiDir) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("UI not found");
    return;
  }
  const urlPath = params.path ?? "/";
  if (!serveStaticUi(res, uiDir, urlPath)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
};

// Icon rendering function - will be called from main server with SVG generation logic
let renderIconFn: ((size: number, color?: string) => Buffer) | null = null;

export function setIconRenderer(fn: (size: number, color?: string) => Buffer) {
  renderIconFn = fn;
}

export const serveIcon: RouteHandler = (_ctx, req, res, params) => {
  if (!renderIconFn) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Icon renderer not initialized");
    return;
  }
  const size = params.param1 ? parseInt(params.param1, 10) : 0;
  if (!size || (size !== 192 && size !== 512)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Invalid icon size");
    return;
  }
  const color = colorFromUrl(req);
  const png = renderIconFn(size, color ?? undefined);
  res.writeHead(200, {
    "Content-Type": "image/png",
    "Cache-Control": "max-age=86400",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(png);
};
