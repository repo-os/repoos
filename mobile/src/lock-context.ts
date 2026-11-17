import type { ServerEntry } from "./types";

export type LockContext = { kind: "reopen" } | { kind: "server"; server: ServerEntry };

/** Preserve the pending server action only when a retry authenticates. */
export function serverToOpenAfterLockRetry(
  context: LockContext | null,
  verified: boolean,
): ServerEntry | null {
  return verified && context?.kind === "server" ? context.server : null;
}
