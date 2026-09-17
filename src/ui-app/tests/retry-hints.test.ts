import { describe, expect, it } from "vitest";
import { autoRepairHint, retryCountFrom, retryHint, STUCK_SILENCE_MS } from "../src/lib/retryHints";
import type { Task } from "../src/types";

const makeTask = (over: Partial<Task> = {}): Task => ({
  id: "0001",
  title: "Test task",
  type: "feature",
  status: "review",
  priority: "p2",
  area: "web",
  assignee: "ai",
  assignedTo: "ai",
  createdBy: "",
  branch: "",
  tags: [],
  needsInput: false,
  needsMerge: false,
  created_at: null,
  updated_at: null,
  path: "work/0001-test.md",
  absPath: "/tmp/repo/work/0001-test.md",
  body: "",
  extra: {},
  agentOverride: null,
  cliOverride: null,
  modelOverride: null,
  git: {
    branchExists: false,
    worktreeExists: false,
    lastCommit: null,
    lastCommitAt: null,
    worktreePath: null,
    dirty: false,
  },
  preview: null,
  ...over,
});

const NOW = Date.parse("2026-09-17T12:00:00Z");
/** An activity timestamp 10s before NOW — well inside the not-stuck window. */
const FRESH = "2026-09-17T11:59:50Z";

describe("retryCountFrom", () => {
  it("reads the first-class field a BoardTask carries", () => {
    expect(retryCountFrom(makeTask({ checkRetryCount: 2 }), "check")).toBe(2);
  });

  it("reads the extra key a full Task's SSE payload carries", () => {
    const task = makeTask({ extra: { check_retry_count: 1 } });
    expect(retryCountFrom(task, "check")).toBe(1);
  });

  it("returns 0 (a deliberate clear) when extra exists without the key", () => {
    expect(retryCountFrom(makeTask({ extra: {} }), "mergeConflict")).toBe(0);
  });

  it("returns null when the task carries neither representation", () => {
    const task = makeTask();
    (task as { extra?: Record<string, unknown> }).extra = undefined;
    expect(retryCountFrom(task, "handoffSignal")).toBeNull();
  });
});

describe("retryHint", () => {
  it("labels the retry with its cap when no activity timestamp is known", () => {
    const hint = retryHint("check", 1, undefined, NOW);
    expect(hint.label).toBe("fixing check failure (retry 1/2)");
    expect(hint.cls).toBe("tc-coding");
    expect(hint.title).toMatch(/automatically fixing/i);
  });

  it("flips to the stuck variant after the silence window", () => {
    const lastActivity = new Date(NOW - STUCK_SILENCE_MS - 30_000).toISOString();
    const hint = retryHint("mergeConflict", 2, lastActivity, NOW);
    expect(hint.cls).toBe("tc-stuck");
    expect(hint.label).toMatch(/^stuck · silent /);
  });
});

describe("autoRepairHint", () => {
  it("returns null when no agent is running (retries exhausted)", () => {
    const task = makeTask({ checkRetryCount: 2 });
    expect(autoRepairHint({ task, running: false, lastActivity: FRESH, now: NOW })).toBeNull();
  });

  it("shows the check-failure hint for a running review task", () => {
    const task = makeTask({ checkRetryCount: 1 });
    const hint = autoRepairHint({ task, running: true, lastActivity: FRESH, now: NOW });
    expect(hint?.label).toContain("fixing check failure");
  });

  it("prefers the merge-conflict hint when both counters are set", () => {
    const task = makeTask({
      extra: { check_retry_count: 1, merge_conflict_retry_count: 1 },
    });
    const hint = autoRepairHint({ task, running: true, lastActivity: FRESH, now: NOW });
    expect(hint?.label).toContain("fixing merge conflict");
  });

  it("shows the handoff-signal hint for a running active task", () => {
    const task = makeTask({ status: "active", extra: { handoff_signal_retry_count: 2 } });
    const hint = autoRepairHint({ task, running: true, lastActivity: FRESH, now: NOW });
    expect(hint?.label).toContain("confirming handoff");
  });

  it("returns null for a running review task with no retry counter", () => {
    const task = makeTask({ checkRetryCount: 0, mergeConflictRetryCount: 0 });
    expect(autoRepairHint({ task, running: true, lastActivity: FRESH, now: NOW })).toBeNull();
  });
});
