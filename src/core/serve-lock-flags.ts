/**
 * Serve flags persisted in `.repoos/serve-*.lock` so `repoos restart` can respawn
 * a hand-run server with the same CLI options (#1091).
 */
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Flags `repoos restart` can safely replay when respawning a hand-run server.
 * `--port`/`--host` are handled explicitly and must not be duplicated here.
 * `--preview-overrides` also matters: a server started with it (as an auth-less
 * preview) must not come back with the base config (#1091 review pass 2).
 */
const REPLAYABLE_FLAGS = new Set([
  "--quiet",
  "-q",
  "--no-tailscale-https",
  "--preview-overrides",
  "--no-preview-overrides",
]);

/** argv tail from `repoos serve` (not including serve/port/host values). */
export function captureServeLockFlags(cliArgs: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < cliArgs.length; i++) {
    const arg = cliArgs[i]!;
    if (arg === "--port" || arg === "-p" || arg === "--host") {
      i++;
      continue;
    }
    if (REPLAYABLE_FLAGS.has(arg)) out.push(arg);
  }
  return out;
}

/** Resolved `dist/cli/index.js` for needsCliEntry spawns (dist/core-safe). */
export function compiledCliEntry(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const parent = dirname(moduleDir);
  const distCli = join(parent, "cli", "index.js");
  if (existsSync(distCli)) return distCli;
  const repoRoot = dirname(parent);
  return join(repoRoot, "dist", "cli", "index.js");
}

export function buildHandRunServeArgv(
  port: number,
  host: string,
  serveFlags: readonly string[] = [],
): string[] {
  return ["serve", "--port", String(port), "--host", host, ...serveFlags];
}

/** Reconstruct lock flags from a live `ps` command line when the lock predates serveFlags. */
export function extractServeFlagsFromCommand(command: string): string[] {
  return captureServeLockFlags(command.split(/\s+/));
}
