import { basename } from "node:path";
import type { RouteContext, RouteHandler } from "./types.js";
import { serveStaticUi, UI_MIME } from "./helpers.js";

export const serveManifest: RouteHandler = (ctx, _req, res) => {
  const { config } = ctx;
  const name = basename(config.root) || "repoos";
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
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
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
let renderIconFn: ((size: number) => Buffer) | null = null;

export function setIconRenderer(fn: (size: number) => Buffer) {
  renderIconFn = fn;
}

export const serveIcon: RouteHandler = (_ctx, _req, res, params) => {
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
  const png = renderIconFn(size);
  res.writeHead(200, {
    "Content-Type": "image/png",
    "Cache-Control": "max-age=86400",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(png);
};
