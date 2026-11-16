/**
 * Temp-directory creation that survives a vanished `$TMPDIR`.
 *
 * Managed agent turns get their own per-run temp directory (see
 * `src/core/agent-run-tmpdir.ts`). A long `repoos check` can outlive the run
 * that owned that directory, or the supervisor can remove it between steps;
 * `mkdtemp` then fails with `ENOENT` even though the system temp root is fine.
 * Recreating the configured base is safe and keeps the caller in the same
 * isolated directory.
 */
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function makeTempDir(prefix: string): string {
  const base = tmpdir();
  try {
    mkdirSync(base, { recursive: true });
  } catch {
    // If the base is genuinely unusable, mkdtemp below reports the real error.
  }
  return mkdtempSync(join(base, prefix));
}
