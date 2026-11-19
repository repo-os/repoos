/**
 * Duplicate checks for the saved server list.
 *
 * Pure functions so the add and rename paths share one set of messages and the
 * tests can cover them without the Capacitor store.
 */
import { serverUrlOf } from "./reachability";
import type { ServerEntry } from "./types";

/**
 * Why `serverUrl` can't be saved because it is already in the list, or null.
 * Distinct Serve paths can map to different RepoOS projects on one host, so
 * the comparison is on the normalized origin plus path.
 */
export function duplicateUrlProblem(
  servers: ServerEntry[],
  serverUrl: string,
  exceptId?: string,
): string | null {
  const existing = servers.find((s) => s.id !== exceptId && serverUrlOf(s.url) === serverUrl);
  return existing
    ? `That server is already saved as "${existing.name}". Pick it from the list instead.`
    : null;
}

/**
 * Why `name` can't be used because another saved server already has it, or
 * null. Case and surrounding spaces don't count, because the picker and the
 * tailnet matching both treat names that way.
 */
export function duplicateNameProblem(
  servers: ServerEntry[],
  name: string,
  exceptId?: string,
): string | null {
  const key = name.trim().toLowerCase();
  if (!key) return null;
  const existing = servers.find((s) => s.id !== exceptId && s.name.trim().toLowerCase() === key);
  return existing
    ? `A server named "${existing.name}" is already saved. Give this one a different display name.`
    : null;
}
