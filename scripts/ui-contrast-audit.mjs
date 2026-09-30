#!/usr/bin/env node
/**
 * Launcher for RepoOS's rendered contrast audit (#0596) — the sibling of
 * scripts/ui-smoke.mjs, same shape for the same reasons:
 *
 *   bun run contrast:audit    (expects a fresh build; `repoos check` builds first)
 *
 * The real work is `cmdContrastAudit()` in src/commands/ui-contrast-audit.ts
 * (compiled to dist/): it boots the built app against a throwaway fixture and
 * walks every visible text node across all theme scopes in headless WebKit.
 * Exits 0 on pass — or when Playwright/WebKit isn't installed (skip) — 1 on
 * contrast failures.
 *
 * ── Runtime: Bun when available, Node otherwise ─────────────────────────────
 * `bun run contrast:audit` alone would still execute the `node` in the script
 * body, so this file re-execs itself under Bun, once, whenever Bun is on PATH
 * and not opted out with `REPOOS_RUNTIME=node`. Same block as
 * scripts/ui-smoke.mjs and scripts/run-tests.mjs (mirroring
 * `reexecUnderBunIfRequested()` in src/core/runtime.ts), duplicated inline
 * because this file runs directly with no TS loader.
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
console.log(`  · contrast audit runtime: ${runtime}`);

const entry = new URL("../dist/commands/ui-contrast-audit.js", import.meta.url);
if (!existsSync(entry)) {
  console.error("dist/commands/ui-contrast-audit.js not found. Run `bun run build` first.");
  process.exit(1);
}

const { cmdContrastAudit } = await import(entry.href);
process.exit(await cmdContrastAudit());
