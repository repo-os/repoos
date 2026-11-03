/**
 * #1011 — snapshot/SSE alternation must not flap a check that is progressing.
 */
import { describe, expect, it } from "vitest";
import { isCheckHeartbeatStalled } from "../../core/active-task-card.js";
import { mergeTaskCheckRuns } from "../src/lib/task-check-runs";
import type { TaskCheckRun } from "../src/types";

const NOW = Date.parse("2026-11-01T12:00:00.000Z");

function run(over: Partial<TaskCheckRun> = {}): TaskCheckRun {
  return {
    id: "1007-handoff-finalize-1",
    taskId: "1007",
    kind: "handoff-finalize",
    startedAt: "2026-11-01T11:40:00.000Z",
    finishedAt: null,
    durationMs: null,
    running: true,
    passed: null,
    code: null,
    output: "",
    scope: "changed:main",
    machine: "air",
    lastProgressAt: new Date(NOW - 5_000).toISOString(),
    ...over,
  };
}

function stalled(runs: TaskCheckRun[]): boolean {
  const live = runs.find((item) => item.running);
  return isCheckHeartbeatStalled(live?.lastProgressAt, NOW);
}

describe("mergeTaskCheckRuns (#1011)", () => {
  it("does not toggle stalled while snapshot and SSE alternate on a live check", () => {
    const fresh = new Date(NOW - 5_000).toISOString();
    let runs = [run({ lastProgressAt: fresh })];
    expect(stalled(runs)).toBe(false);

    runs = mergeTaskCheckRuns(runs, [run({ lastProgressAt: null })]);
    expect(runs[0]?.lastProgressAt).toBe(fresh);
    expect(stalled(runs)).toBe(false);

    runs = mergeTaskCheckRuns(runs, [run({ lastProgressAt: fresh })]);
    const sseBeat = new Date(NOW - 1_000).toISOString();
    runs = runs.map((item) => ({ ...item, lastProgressAt: sseBeat }));
    expect(stalled(runs)).toBe(false);

    runs = mergeTaskCheckRuns(runs, [
      run({ lastProgressAt: new Date(NOW - 10 * 60_000).toISOString() }),
    ]);
    expect(runs[0]?.lastProgressAt).toBe(sseBeat);
    expect(stalled(runs)).toBe(false);
  });

  it("still reports a genuinely stalled check when every source is old or missing", () => {
    const old = new Date(NOW - 10 * 60_000).toISOString();
    const fromSnapshot = mergeTaskCheckRuns(undefined, [run({ lastProgressAt: old })]);
    expect(stalled(fromSnapshot)).toBe(true);

    const missing = mergeTaskCheckRuns(undefined, [run({ lastProgressAt: null })]);
    expect(stalled(missing)).toBe(true);

    const bothOld = mergeTaskCheckRuns([run({ lastProgressAt: old })], [
      run({ lastProgressAt: null }),
    ]);
    expect(stalled(bothOld)).toBe(true);
  });

  it("keeps a running SSE run the snapshot has not listed yet", () => {
    const live = run();
    const merged = mergeTaskCheckRuns([live], []);
    expect(merged).toEqual([live]);
    expect(stalled(merged)).toBe(false);
  });
});
