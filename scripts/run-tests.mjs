#!/usr/bin/env node
/**
 * Test entrypoint (`bun run test`). Runs the suite in two passes so the
 * wall-clock guards in the latency-sensitive suites measure real cost instead
 * of contention with the parallel worker pool:
 *
 *   1. everything EXCEPT the isolated suites, at the configured pool size
 *   2. the isolated suites alone, single-worker, with a small retry budget
 *
 * boot-timing.test.ts (#0271) asserts an absolute ceiling on time-to-first
 * `/api/health`; on a loaded box that ceiling is blown by CPU/memory pressure
 * from the other workers, not by a regression. Pass 2 hands it the machine
 * and sets REPOOS_STRICT_TIMING=1 — the only context where those absolute
 * wall-clock assertions are meaningful. Outside pass 2 (an ad-hoc `vitest`
 * run, the parallel pass 1) the suite skips itself rather than flake.
 *
 * Extra args (e.g. `--changed <ref>` from `repoos check` re-verification) are
 * forwarded to BOTH passes; vitest's own change graph then decides whether the
 * isolated suites actually run.
 *
 * ── Runtime: always Bun when available, Node otherwise — never a mix ──────
 * package.json's "test" script is literally `node scripts/run-tests.mjs`, so
 * every subprocess this file spawns via `process.execPath` (vitest, and every
 * `git` call inside a test body) ran under Node even when invoked as
 * `bun run test` — Bun only actually took over if the caller remembered the
 * `--bun` flag (`bun run --bun test`, what `repoos check` uses internally).
 * That silent split produced two genuinely different runtimes for the exact
 * same command depending on how it was typed, and cost real debugging time:
 * boot-timing.test.ts's git-heavy fixture behaves differently enough between
 * the two (Bun's much faster subprocess spawning can flip which of two
 * concurrent async operations finishes first, see #0330) that a "fix"
 * verified under one runtime silently failed under the other. The block
 * below re-execs this whole script under Bun, once, whenever Bun is on PATH
 * and not explicitly opted out (`REPOOS_RUNTIME=node`) — mirroring
 * `reexecServeUnderBunIfRequested()` in src/core/runtime.ts, duplicated
 * inline rather than imported because this file runs directly via
 * `node scripts/run-tests.mjs` with no TypeScript loader available. So
 * `bun run test`, `npm run test`, `node scripts/run-tests.mjs`, and
 * `bun run --bun test` now all converge on the same runtime.
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

const VITEST = fileURLToPath(new URL("../node_modules/vitest/vitest.mjs", import.meta.url));
const CONFIG = "src/ui-app/vite.config.ts";

// Basenames of suites whose assertions include an absolute latency ceiling.
// Keep this list tight — pass 2 has no parallelism, so every file added
// serialises onto it.
const ISOLATED = ["boot-timing.test.ts"];

// `bun run test -- <args>` / `npm test -- <args>` can leak the bare `--`.
const passthrough = process.argv.slice(2).filter((a) => a !== "--");
const scoped = passthrough.includes("--changed");

const vitest = (args, env) => {
  const r = spawnSync(process.execPath, [VITEST, "run", "--config", CONFIG, ...args], {
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  return r.status ?? 1;
};

// Pass 1 — the bulk of the suite at the configured pool size. `--exclude` takes
// a glob relative to the vitest root; `**/` keeps it root-agnostic.
// `--passWithNoTests` only when scoped: a full run that finds nothing is a real
// failure.
const bulk = vitest([
  ...passthrough,
  ...(scoped ? ["--passWithNoTests"] : []),
  ...ISOLATED.flatMap((f) => ["--exclude", `**/${f}`]),
]);

// Pass 2 — the latency-sensitive suites with the machine to themselves. The
// basenames are positional name filters (substring-matched against the path).
// `--passWithNoTests` because a `--changed` run may touch none of them.
const isolated = vitest([...passthrough, "--passWithNoTests", "--retry", "2", ...ISOLATED], {
  REPOOS_TEST_WORKERS: "1",
  REPOOS_STRICT_TIMING: "1",
});

process.exit(bulk || isolated);
