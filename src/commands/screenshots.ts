/**
 * The committed screenshots fixture subsystem was removed.
 * This file is intentionally left as a no-op stub to avoid stale command wiring
 * while the repository no longer generates or tracks screenshots/.
 */
export const SHOTS_DIR = "screenshots";
export const HASH_FILE = "screenshots/.ui-hash";

export function screenshotsHash(_root: string): string | null {
  return null;
}

export function screenshotsStale(_root: string): boolean {
  return false;
}
