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
// when the marker proves `src/` is unchanged (`code: "fresh"`); a missing or
// mismatched marker, or a missing `dist/`, still builds.
//
// Force a full rebuild with `--force` or `REPOOS_FORCE_BUILD=1`.
//
// Only `src/` is hashed, so a change to `scripts/`, `package.json`,
// `tsconfig.json` or `bun.lock` does not by itself invalidate the marker — a
// forced build is how those get picked up before the next `src/` edit.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const force = process.env.REPOOS_FORCE_BUILD === "1" || process.argv.slice(2).includes("--force");

// Decide via the shared check. It is imported dynamically, not statically, so a
// broken `src/core/build.ts` — the very thing a build is meant to catch — falls
// through to `build:raw` and lets tsc report the real error, instead of failing
// here at import time and masking it. Any failure to assess staleness builds:
// never skip when unsure.
let skip = false;
try {
  const { checkBuildForRoot, shouldSkipBuild } = await import("../src/core/build.ts");
  skip = shouldSkipBuild(checkBuildForRoot(root), force);
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
