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
 * from the other workers, not by a regression. Pass 2 hands it the machine.
 *
 * Extra args (e.g. `--changed <ref>` from `repoos check` re-verification) are
 * forwarded to BOTH passes; vitest's own change graph then decides whether the
 * isolated suites actually run.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const VITEST = fileURLToPath(new URL("../node_modules/vitest/vitest.mjs", import.meta.url));
const CONFIG = "src/ui-app/vite.config.ts";

// Suites whose assertions include an absolute latency ceiling. Keep this list
// tight — pass 2 has no parallelism, so every file added serialises onto it.
const ISOLATED = ["src/ui-app/tests/boot-timing.test.ts"];

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

// Pass 1 — the bulk of the suite at the configured pool size. `--passWithNoTests`
// only when scoped: a full run that suddenly finds nothing is a real failure.
const bulk = vitest([
  ...passthrough,
  ...(scoped ? ["--passWithNoTests"] : []),
  ...ISOLATED.flatMap((f) => ["--exclude", f]),
]);

// Pass 2 — the latency-sensitive suites with the machine to themselves.
// `--passWithNoTests` because a `--changed` run may touch none of them.
const isolated = vitest(
  [...passthrough, "--passWithNoTests", "--retry", "2", ...ISOLATED],
  { REPOOS_TEST_WORKERS: "1" },
);

process.exit(bulk || isolated);
