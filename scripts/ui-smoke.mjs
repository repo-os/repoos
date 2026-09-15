#!/usr/bin/env node
/**
 * RepoOS's own UI smoke test, declared as this repo's `smoke` package.json
 * script so `repoos check` runs it through the same per-project opt-in every
 * managed project uses (#0348), with no RepoOS-only branch in check.ts.
 *
 *   bun run smoke    (expects a fresh build; `repoos check` builds first)
 *
 * Boots the BUILT app (dist/ui) against a throwaway fixture repo and drives it
 * with headless WebKit. Exits 0 on pass, or when Playwright/WebKit isn't
 * installed (skip); 1 on failure.
 *
 * ── Runtime: Bun when available, Node otherwise ─────────────────────────────
 * `bun run smoke` alone would still execute the `node` in the script body, so
 * this file re-execs itself under Bun, once, whenever Bun is on PATH and not
 * opted out with `REPOOS_RUNTIME=node`. Same block as scripts/run-tests.mjs
 * (mirroring `reexecUnderBunIfRequested()` in src/core/runtime.ts),
 * duplicated inline because this file runs directly with no TS loader.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

if (
  typeof process.versions.bun !== "string" &&
  process.env.REPOOS_RUNTIME !== "node" &&
  process.env.REPOOS_RUNTIME_REEXEC !== "1"
) {
  const bunPath = resolveBun();
  if (bunPath) {
    const r = spawnSync(bunPath, [fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
      stdio: "inherit",
      env: { ...process.env, REPOOS_RUNTIME_REEXEC: "1" },
    });
    process.exit(r.status ?? 1);
  }
}

/** `REPOOS_BUN_PATH` if set, else `bun` resolved off PATH. Never throws. */
function resolveBun() {
  const explicit = process.env.REPOOS_BUN_PATH;
  if (explicit) return existsSync(explicit) ? explicit : null;
  const finder = process.platform === "win32" ? "where" : "which";
  try {
    const r = spawnSync(finder, ["bun"], { encoding: "utf8", timeout: 4000 });
    if (r.status !== 0) return null;
    const first = r.stdout
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find(Boolean);
    return first && existsSync(first) ? first : null;
  } catch {
    return null;
  }
}

const runtime =
  typeof process.versions.bun === "string"
    ? `Bun ${process.versions.bun}`
    : `Node ${process.versions.node}`;
console.log(`  · UI smoke runtime: ${runtime}`);

const entry = new URL("../dist/commands/ui-smoke.js", import.meta.url);
if (!existsSync(entry)) {
  console.error("dist/commands/ui-smoke.js not found. Run `bun run build` first.");
  process.exit(1);
}

const { cmdUISmoke } = await import(entry.href);
process.exit(await cmdUISmoke());
