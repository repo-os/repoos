#!/usr/bin/env bun
// Staleness-aware build entry (#0377).
//
// `bun run build` used to recompile unconditionally (~5s), even when `src/` had
// not changed since the last build. That is wasteful on its own, but it also
// forced every caller that wanted to avoid the redundant work to reimplement
// the same "should I rebuild?" decision — `repoos check`'s REPOOS_SKIP_BUILD,
// the since-deleted preview `ensureFreshBuild`, etc. Making the build command
// itself smart means there is exactly one implementation, and every caller
// (previews, close-out, agents, humans) gets the cheap path for free.
//
// The check reuses `checkBuildForRoot` (src/core/build.ts) — the same function
// `repoos check`'s staleness step uses — rather than a fourth copy. Skip only
// when the marker proves `src/` is unchanged (`code: "fresh"`) AND the previous
// build's outputs are still on disk; a missing or mismatched marker, a missing
// `dist/`, or a missing output still builds.
//
// Force a full rebuild with `--force` or `REPOOS_FORCE_BUILD=1`.
//
// Only `src/` is hashed, so a change to `scripts/`, `package.json`,
// `tsconfig.json` or `bun.lock` does not by itself invalidate the marker — a
// forced build is how those get picked up before the next `src/` edit.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Converge on Bun exactly like scripts/run-tests.mjs (mirroring
// reexecUnderBunIfRequested in src/core/runtime.ts): the staleness check imports
// TypeScript, and build:raw is bun-driven, so a Node invocation must hand off.
// With no Bun the raw pipeline reports its own Bun-missing failure — never skip
// a build just because the checker couldn't run.
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

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const force = process.env.REPOOS_FORCE_BUILD === "1" || process.argv.slice(2).includes("--force");

/**
 * Outputs a completed `build:raw` leaves behind. `copy-assets.mjs` (which writes
 * the marker) runs LAST, so a fresh marker already implies these exist — but a
 * manual deletion of `dist/` contents must not be papered over by a skip.
 */
function buildOutputsPresent(r) {
  return (
    existsSync(join(r, "dist", "cli", "index.js")) &&
    existsSync(join(r, "dist", "ui", "index.html"))
  );
}

/**
 * A package release can change package.json without changing src/. In that
 * case a fresh source hash alone is not enough: copy-assets.mjs must rerun to
 * stamp the release version into dist/.build-info.json before npm packs it.
 */
function buildVersionMatchesPackage(r) {
  try {
    const { version: packageVersion } = JSON.parse(readFileSync(join(r, "package.json"), "utf8"));
    const { version: buildVersion } = JSON.parse(
      readFileSync(join(r, "dist", ".build-info.json"), "utf8"),
    );
    return typeof packageVersion === "string" && packageVersion === buildVersion;
  } catch {
    return false;
  }
}

// Decide via the shared check. It is imported dynamically, not statically, so a
// broken `src/core/build.ts` — the very thing a build is meant to catch — falls
// through to `build:raw` and lets tsc report the real error, instead of failing
// here at import time and masking it. Any failure to assess staleness builds:
// never skip when unsure.
let skip = false;
try {
  const { checkBuildForRoot, shouldSkipBuild } = await import("../src/core/build.ts");
  skip =
    shouldSkipBuild(checkBuildForRoot(root), force) &&
    buildOutputsPresent(root) &&
    buildVersionMatchesPackage(root);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.warn(`build: staleness check unavailable (${message}) — running a full build`);
}

if (skip) {
  console.log(
    "build: up to date (src/ unchanged) — skipping rebuild. " +
      "Use --force or REPOOS_FORCE_BUILD=1 to rebuild anyway.",
  );
  process.exit(0);
}
if (force) {
  console.log("build: forced rebuild (--force / REPOOS_FORCE_BUILD)");
}

// Run the real pipeline (`build:raw`) on the current runtime. Build already
// assumes Bun (copy-assets is `bun scripts/copy-assets.mjs` and build:ui runs
// vue-tsc/vite through Bun), so process.execPath is bun here.
const real = spawnSync(process.execPath, ["run", "build:raw"], { cwd: root, stdio: "inherit" });
process.exit(real.status ?? 1);
