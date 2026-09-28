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

/** Resolve a deep link for task notifications (absolute when a public origin is known). */
export function taskNotificationLink(
  config: RepoOSConfig,
  taskId: string,
  publicOrigin?: string,
): string {
  const path = hubTaskRoutePath(taskId);
  const fromEnv = process.env.REPOOS_PUBLIC_URL?.trim();
  if (fromEnv) return `${normalizeOrigin(fromEnv)}${path}`;
  if (publicOrigin) return `${normalizeOrigin(publicOrigin)}${path}`;
  const tunnelOrigin = tunnelPublicOrigin(config.root);
  if (tunnelOrigin) return `${tunnelOrigin}${path}`;
  return path;
}
