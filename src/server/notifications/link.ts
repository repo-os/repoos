import type { RepoOSConfig } from "../../core/types.js";
import { hubTaskRoutePath } from "../../core/hub-task-search.js";
import { readTunnelConfig } from "../../core/tunnel.js";

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, "");
}

function tunnelPublicOrigin(repoRoot: string): string | null {
  try {
    const tunnel = readTunnelConfig(repoRoot);
    for (const app of Object.values(tunnel.apps)) {
      const host = app.hostname?.trim();
      if (host) return `https://${host}`;
    }
  } catch {
    /* no tunnel config */
  }
  return null;
}

/**
 * Base web-UI origin (no trailing slash), or `""` when none is known.
 *
 * One resolution order for every surface that links back into the web UI:
 * explicit `REPOOS_PUBLIC_URL`, then the caller-supplied control-plane origin,
 * then a configured Cloudflare Tunnel hostname. Telegram commands (#0540) use
 * this directly instead of inventing a second origin rule.
 */
export function webOrigin(config: Pick<RepoOSConfig, "root">, publicOrigin?: string): string {
  const fromEnv = process.env.REPOOS_PUBLIC_URL?.trim();
  if (fromEnv) return normalizeOrigin(fromEnv);
  if (publicOrigin) return normalizeOrigin(publicOrigin);
  return tunnelPublicOrigin(config.root) ?? "";
}

/** Absolute web-UI URL for a route path, or the bare path when no origin is known. */
export function webUiLink(
  config: Pick<RepoOSConfig, "root">,
  path: string,
  publicOrigin?: string,
): string {
  const base = webOrigin(config, publicOrigin);
  const route = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${route}` : route;
}

/** Resolve a deep link for task notifications (absolute when a public origin is known). */
export function taskNotificationLink(
  config: RepoOSConfig,
  taskId: string,
  publicOrigin?: string,
): string {
  return webUiLink(config, hubTaskRoutePath(taskId), publicOrigin);
}
