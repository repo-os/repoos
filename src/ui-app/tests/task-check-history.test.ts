/**
 * TaskCheckManager's durable-history slice (#0564): a completed check records
 * its own row (written by the CLI child), so the manager records only the one
 * outcome the child cannot — a run cancelled or killed before it could exit
 * (done(null)). Every run carries its scope and machine for the live chip.
 */
import { afterEach, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TaskCheckManager, type TaskCheckRun } from "../../server/task-check.js";
import { CheckStore, resetCheckStore } from "../../core/check-store.js";
import { NO_CHECK_PLAN_NOTICE } from "../../core/check-skip.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  resetCheckStore();
});

function manager(): { m: TaskCheckManager; store: CheckStore; root: string } {
  const root = mkdtempSync(join(tmpdir(), "repoos-taskcheck-"));
  dirs.push(root);
  return { m: new TaskCheckManager(root), store: new CheckStore(root), root };
}

function run(
  m: TaskCheckManager,
  scope = "full",
): { run: TaskCheckRun; done: (code: number | null) => void } {
  const events: Array<{ kind: string; run: TaskCheckRun }> = [];
  const handle = m.start("0564", "merge-gate", (r, kind) => events.push({ kind, run: r }), {
    scope,
  });
  return { run: events[0]!.run, done: handle.done };
}

describe("TaskCheckManager durable cancelled runs (#0564)", () => {
  it("does NOT record a durable row when the child exited on its own", () => {
    const { m, store } = manager();
    const h = run(m);
    h.done(1);
    // The CLI child records its own completed run; the manager stays silent so
    // a completed run is exactly one row in the history.
    expect(store.list()).toHaveLength(0);
    expect(h.run.passed).toBe(false);
  });

  it("records a cancelled row when the run was killed before it could exit", () => {
    const { m, store } = manager();
    const h = run(m, "changed:abc1234");
    h.done(null);

    const rows = store.list();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      taskId: "0564",
      phase: "close-out",
      machine: h.run.machine,
      remote: false,
      scope: "changed:abc1234",
      outcome: "cancelled",
      failedStep: null,
    });
    expect(Number.isFinite(rows[0]!.durationMs)).toBe(true);
  });

  it("records nothing without a repo root (tests, embedded uses)", () => {
    const m = new TaskCheckManager();
    const events: TaskCheckRun[] = [];
    const handle = m.start("0564", "handoff-finalize", (r) => events.push(r));
    handle.done(null);
    expect(events[0]!.passed).toBe(false);
    // No store was configured, so no durable write is even attempted.
  });

  it("carries scope + machine metadata on the tracked run", () => {
    const { m } = manager();
    const h = run(m, "full");
    expect(h.run.scope).toBe("full");
    expect(h.run.machine).toBeTruthy();
    expect(h.run.running).toBe(true);
    h.done(0);
    expect(h.run.running).toBe(false);
    expect(h.run.passed).toBe(true);
  });
});

describe("TaskCheckManager skipped flag (#0592)", () => {
  it("sets skipped only when exit 0 and output carries the no-plan notice", () => {
    const { m } = manager();
    const events: TaskCheckRun[] = [];
    const handle = m.start("0592", "handoff-finalize", (r) => events.push(r));
    handle.chunk(`  ⚠ ${NO_CHECK_PLAN_NOTICE}\n`);
    handle.done(0);
    expect(events.at(-1)!.skipped).toBe(true);
    expect(events.at(-1)!.passed).toBe(true);
  });

  it("does NOT set skipped when the run failed even if output echoes the notice", () => {
    const { m } = manager();
    const events: TaskCheckRun[] = [];
    const handle = m.start("0592", "handoff-finalize", (r) => events.push(r));
    handle.chunk(`expected output to contain: ${NO_CHECK_PLAN_NOTICE.trimEnd()}\n`);
    handle.done(1);
    expect(events.at(-1)!.skipped).toBe(false);
    expect(events.at(-1)!.passed).toBe(false);
  });
});
