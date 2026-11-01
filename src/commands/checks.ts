import {
  DEFAULT_TEST_CASE_LIST_LIMIT,
  getCheckStore,
  MAX_TEST_CASE_LIST_LIMIT,
} from "../core/check-store.js";
import { formatSlowestTestFiles } from "../core/test-file-timings.js";
import { formatSlowestTestCases } from "../core/test-case-timings.js";
import { c } from "../cli/colors.js";
import { loadConfig } from "../core/config.js";
import {
  inspectCrossProcessSlots,
  listSlotWaiterPids,
  localCheckLockRoot,
  releaseLocalCheckSlot,
} from "../core/cross-process-slots.js";
import { currentQueueMarkers, readQueueMarkers } from "../core/local-queue-marker.js";
import { mainCheckoutRoot } from "../core/git.js";
import { heavySlotLimit } from "../core/resource-limits.js";

function resolveChecksRoot(): string {
  const config = loadConfig();
  try {
    return mainCheckoutRoot(config.root);
  } catch {
    return config.root;
  }
}

function parseTimingsFlags(args: string[]): {
  json: boolean;
  tests: boolean;
  runId?: number;
  recentRuns: number;
  limit: number;
  offset: number;
} {
  let json = false;
  let tests = false;
  let runId: number | undefined;
  let recentRuns = 10;
  let limit = DEFAULT_TEST_CASE_LIST_LIMIT;
  let offset = 0;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") json = true;
    else if (a === "--tests" || a === "tests") tests = true;
    else if (a === "--run-id" || a === "--run") {
      const n = Number(args[++i]);
      if (Number.isFinite(n) && n > 0) runId = Math.floor(n);
    } else if (a === "--recent-runs" || a === "--recent") {
      const n = Number(args[++i]);
      if (Number.isFinite(n) && n > 0) recentRuns = Math.min(100, Math.floor(n));
    } else if (a === "--limit") {
      const n = Number(args[++i]);
      if (Number.isFinite(n) && n > 0) limit = Math.min(MAX_TEST_CASE_LIST_LIMIT, Math.floor(n));
    } else if (a === "--offset") {
      const n = Number(args[++i]);
      if (Number.isFinite(n) && n >= 0) offset = Math.floor(n);
    }
  }
  return { json, tests, runId, recentRuns, limit, offset };
}

function cmdChecksTimings(args: string[]): void {
  const config = loadConfig();
  const root = resolveChecksRoot();
  const flags = parseTimingsFlags(args);
  const store = getCheckStore(root, config.cacheDir);

  if (flags.tests) {
    const result = store.listSlowTestCases({
      runId: flags.runId,
      recentRuns: flags.recentRuns,
      limit: flags.limit,
      offset: flags.offset,
    });
    if (flags.json) {
      console.log(JSON.stringify({ ok: true, ...result }, null, 0));
      return;
    }
    const scope =
      flags.runId != null
        ? `run #${flags.runId}`
        : `last ${result.recentRuns ?? flags.recentRuns} run(s)`;
    console.log(`Slowest test cases · ${scope} · limit ${result.limit} offset ${result.offset}`);
    if (!result.cases.length) {
      console.log("  (no recorded cases — run repoos check after upgrading)");
      return;
    }
    console.log(
      formatSlowestTestCases(
        result.cases.map(({ file, name, durationMs, result: outcome, retry, caseId }) => ({
          file,
          name,
          caseId,
          retry,
          durationMs,
          result: outcome,
        })),
        result.limit,
      ),
    );
    if (result.hasMore) {
      console.log(c.dim(`  … more rows available (hasMore)`));
    }
    return;
  }

  for (const run of store.list({ limit: 10 })) {
    console.log(
      `${run.startedAt} · ${run.phase} · ${run.machine ?? "local"} · ${run.scope} · ${((run.durationMs ?? 0) / 1000).toFixed(1)}s · run #${run.id}`,
    );
    if (run.testFileTimings?.length) {
      console.log("Slowest test files (test + hook time in file):");
      console.log(formatSlowestTestFiles(run.testFileTimings));
    }
  }
  console.log(
    c.dim(
      "\nIndividual cases: repoos checks timings --tests [--run-id ID] [--recent-runs N] [--limit N] [--offset N] [--json]",
    ),
  );
}

export function cmdChecks(args: string[]): void {
  if (args[0] === "timings") {
    cmdChecksTimings(args.slice(1));
    return;
  }
  if (args[0] !== "slots") {
    console.error(
      "Usage: repoos checks timings [--tests] [--run-id ID] [--recent-runs N] [--limit N] [--offset N] [--json] | slots [--release SLOT --confirm PID]",
    );
    process.exitCode = 2;
    return;
  }
  const config = loadConfig();
  let boardRoot = config.root;
  try {
    boardRoot = mainCheckoutRoot(config.root);
  } catch {
    /* standalone repository checkout */
  }
  const cacheDir = config.cacheDir ?? ".repoos";
  const root = localCheckLockRoot(boardRoot, cacheDir);
  const releaseAt = args.indexOf("--release");
  if (releaseAt >= 0) {
    const slot = Number(args[releaseAt + 1]);
    const confirmAt = args.indexOf("--confirm");
    const pid = Number(args[confirmAt + 1]);
    if (!Number.isInteger(slot) || slot < 0 || !Number.isInteger(pid) || pid <= 0) {
      console.error(
        "Release requires --release SLOT --confirm PID from the current holder listing.",
      );
      process.exitCode = 2;
      return;
    }
    try {
      const holder = inspectCrossProcessSlots(
        root,
        heavySlotLimit(config),
        config.localChecks?.staleAfterMs,
      ).find((item) => item.slot === slot);
      if (!holder?.pid) throw new Error(`slot ${slot} is free`);
      console.log(
        `Releasing slot ${slot}, held by task #${String(holder.meta?.taskId ?? "unknown")} check, PID ${holder.pid}${holder.dead ? ", dead" : holder.wedged ? ", wedged" : ", alive"}.`,
      );
      releaseLocalCheckSlot(root, slot, pid, config.localChecks?.staleAfterMs);
      console.log(c.green("  ✔ Slot released."));
    } catch (error) {
      console.error(c.red("  ✗ ") + (error instanceof Error ? error.message : String(error)));
      process.exitCode = 1;
    }
    return;
  }
  const holders = inspectCrossProcessSlots(
    root,
    heavySlotLimit(config),
    config.localChecks?.staleAfterMs,
  );
  for (const holder of holders) {
    const task = holder.meta?.taskId
      ? `#${String(holder.meta.taskId)} check`
      : "unattributed check";
    console.log(
      holder.pid
        ? `slot ${holder.slot}: ${task}, pid ${holder.pid}, ${holder.dead ? "dead, reclaiming" : holder.wedged ? "wedged" : "alive"}, held ${Math.round(holder.ageMs / 1000)}s, heartbeat ${Math.round(holder.heartbeatAgeMs / 1000)}s ago`
        : `slot ${holder.slot}: free`,
    );
  }
  const queue = currentQueueMarkers(
    readQueueMarkers(boardRoot, cacheDir).filter((entry) => entry.kind === "local-check"),
    listSlotWaiterPids(root),
  );
  queue.forEach((marker) => {
    const waitingMs = Math.max(0, Date.now() - Date.parse(marker.since));
    console.log(
      `queue position ${marker.position}: #${marker.taskId}, waiting ${Math.round(waitingMs / 1000)}s`,
    );
  });
}
