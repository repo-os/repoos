import type { RouteContext, RouteHandler } from "./types.js";
import { serveStaticUi, UI_MIME } from "./helpers.js";
import { projectDisplayName } from "../../core/config.js";

/** Read the optional repo color from the `c` query param, or null when absent/invalid. */
function colorFromUrl(req: { url?: string }): string | null {
  const url = req.url ? new URL(req.url, "http://localhost") : null;
  const c = url?.searchParams.get("c");
  return c && /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : null;
}

/** Read the icon theme from the `theme` query param, defaulting to dark. */
function themeFromUrl(req: { url?: string }): "light" | "dark" {
  const url = req.url ? new URL(req.url, "http://localhost") : null;
  return url?.searchParams.get("theme") === "light" ? "light" : "dark";
}

/** Build an `/icons/*.png` URL, URL-encoding the color (`#` must not become a fragment). */
function iconSrc(size: number, color: string | null, theme: "light" | "dark"): string {
  const params = new URLSearchParams();
  if (color) params.set("c", color);
  params.set("theme", theme);
  return `/icons/icon-${size}.png?${params.toString()}`;
}

/** A web app manifest icon entry, including the appearance `media` member. */
export interface PwaManifestIcon {
  src: string;
  sizes: string;
  type: string;
  media?: string;
  purpose?: string;
}

/** The RepoOS web app manifest shape. */
export interface PwaManifest {
  id: string;
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  display: string;
  orientation: string;
  background_color: string;
  theme_color: string;
  icons: PwaManifestIcon[];
}

/**
 * Per-instance PWA manifest. Each size ships a light and a dark variant wired
 * to `prefers-color-scheme` (the `media` member), so the installed-app icon
 * tracks the OS appearance the way the macOS dock icon does. The optional
 * chosen repo color is baked into the icon URLs (#0280).
 */
export function buildPwaManifest(name: string, color: string | null): PwaManifest {
  return {
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
      {
        src: iconSrc(192, color, "light"),
        sizes: "192x192",
        type: "image/png",
        media: "(prefers-color-scheme: light)",
      },
      {
        src: iconSrc(192, color, "dark"),
        sizes: "192x192",
        type: "image/png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        src: iconSrc(512, color, "light"),
        sizes: "512x512",
        type: "image/png",
        media: "(prefers-color-scheme: light)",
      },
      {
        src: iconSrc(512, color, "dark"),
        sizes: "512x512",
        type: "image/png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        src: iconSrc(512, color, "dark"),
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

export const serveManifest: RouteHandler = (ctx, req, res) => {
  const { config } = ctx;
  const manifest = JSON.stringify(
    buildPwaManifest(projectDisplayName(config.root), colorFromUrl(req)),
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

// Icon rendering function - will be called from main server with the repo's
// name-derived artwork. Takes an explicit light/dark theme (#0645).
let renderIconFn: ((size: number, color?: string, theme?: "light" | "dark") => Buffer) | null =
  null;

export function setIconRenderer(
  fn: (size: number, color?: string, theme?: "light" | "dark") => Buffer,
) {
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
  const png = renderIconFn(size, color ?? undefined, themeFromUrl(req));
  res.writeHead(200, {
    "Content-Type": "image/png",
    "Cache-Control": "max-age=86400",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(png);
};
