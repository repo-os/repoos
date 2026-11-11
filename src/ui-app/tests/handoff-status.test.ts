/**
 * Handoff outcome reporting (#1028): a non-blocking status store plus exactly
 * one queued message for the engineer's next turn.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Agent, RepoOSConfig, Task } from "../../core/types";
import { missionFor } from "../../server/agents";
import { handoffProcessLive } from "../../server/handoff-live";
import {
  beginHandoffStatus,
  deferHandoffStatus,
  deliverHandoffOutcome,
  finishHandoffStatus,
  formatHandoffOutcomeMessage,
  readHandoffStatus,
  truncateHandoffReason,
  updateHandoffStatusStep,
  updateHandoffStatusProgress,
  emitHandoffSupersededIfNeeded,
  reconcileHandoffStatus,
  supersedeHandoffStatus,
  HANDOFF_STATUS_REASON_LIMIT,
} from "../../server/handoff-status";

const roots: string[] = [];

function makeConfig(): RepoOSConfig {
  const root = mkdtempSync(join(tmpdir(), "repoos-handoff-status-"));
  roots.push(root);
  return {
    root,
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
  };
}

const engineer: Agent = { name: "engineer", cli: "qwen code", model: "default", enabled: true };

function fakeRunner() {
  return { queueTaskMessage: vi.fn(() => ({ ok: true })) };
}

function makeTask(): Task {
  return {
    id: "1028",
    title: "Handoff status",
    type: "feature",
    status: "active",
    priority: "p2",
    area: "server",
    assignee: "ai",
    assignedTo: "ai",
    createdBy: "test",
    branch: "feat/handoff-status",
    tags: [],
    needsInput: false,
    needsMerge: false,
    noSourceChange: false,
    created_at: null,
    updated_at: null,
    path: "work/1028-handoff-status.md",
    absPath: "/tmp/work/1028-handoff-status.md",
    body: "Body",
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
  };
}

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe("handoff status store (#1028)", () => {
  it("reports not_requested before any attempt", () => {
    const config = makeConfig();
    expect(readHandoffStatus(config, "1")).toMatchObject({
      state: "not_requested",
      step: null,
      reason: null,
      attempt: 0,
    });
  });

  it("tracks running → step → failed with a truncated reason", () => {
    const config = makeConfig();
    beginHandoffStatus(config, "1", { attemptKey: "run-1", origin: "agent" });
    updateHandoffStatusStep(config, "1", "run-1", "check");
    expect(readHandoffStatus(config, "1")).toMatchObject({
      state: "running",
      step: "check",
      origin: "agent",
    });

    const longReason = "x".repeat(HANDOFF_STATUS_REASON_LIMIT + 50);
    const failed = finishHandoffStatus(config, "1", "run-1", {
      ok: false,
      step: "check",
      detail: longReason,
    });
    expect(failed.state).toBe("failed");
    expect(failed.step).toBe("check");
    expect(failed.reason).toContain("(truncated)");
    expect(failed.reason?.length).toBeLessThan(longReason.length);
    expect(readHandoffStatus(config, "1")).toEqual(failed);
  });

  it("persists check progress so a reloaded client can restore a CLI handoff", () => {
    const config = makeConfig();
    beginHandoffStatus(config, "1047", {
      attemptKey: "review-cli-1",
      origin: "cli",
      step: "check",
    });
    updateHandoffStatusProgress(config, "1047", "review-cli-1", {
      stepsDone: 5,
      stepsTotal: 12,
      currentStep: 6,
      stepName: "tests",
      testsDone: 140,
      testsTotal: 289,
      attempt: 2,
    });
    expect(readHandoffStatus(config, "1047")).toMatchObject({
      state: "running",
      step: "check",
      origin: "cli",
      attempt: 1,
      progress: { stepsDone: 5, stepsTotal: 12, currentStep: 6, testsDone: 140, testsTotal: 289 },
    });
  });

  it("keeps the same record for a replayed attempt key and starts a new attempt otherwise", () => {
    const config = makeConfig();
    const first = beginHandoffStatus(config, "1", { attemptKey: "run-1" });
    const replay = beginHandoffStatus(config, "1", { attemptKey: "run-1" });
    expect(replay.attempt).toBe(first.attempt);
    expect(replay.updatedAt).toBe(first.updatedAt);

    const next = beginHandoffStatus(config, "1", { attemptKey: "run-2" });
    expect(next.attempt).toBe(first.attempt + 1);
    expect(next.state).toBe("running");
    expect(next.outcomeQueued).toBe(false);
  });

  it("records a deferral with its reason", () => {
    const config = makeConfig();
    const deferred = deferHandoffStatus(
      config,
      "1",
      "run-1",
      "2 queued message(s) must be read before review",
    );
    expect(deferred).toMatchObject({
      state: "deferred",
      step: "review",
      reason: "2 queued message(s) must be read before review",
    });
  });

  it("does not let a late result overwrite a newer attempt", () => {
    const config = makeConfig();
    beginHandoffStatus(config, "1", { attemptKey: "run-1" });
    beginHandoffStatus(config, "1", { attemptKey: "run-2" });
    const current = finishHandoffStatus(config, "1", "run-1", {
      ok: false,
      step: "check",
      detail: "old",
    });
    expect(current.attemptKey).toBe("run-2");
    expect(current.state).toBe("running");
  });
});

describe("handoff outcome message (#1028)", () => {
  it("queues exactly one message per attempt, and one per later attempt", () => {
    const config = makeConfig();
    const runner = fakeRunner();

    beginHandoffStatus(config, "1", { attemptKey: "run-1" });
    const failed = finishHandoffStatus(config, "1", "run-1", {
      ok: false,
      step: "check",
      detail: "repoos check failed: test failure",
    });
    expect(deliverHandoffOutcome(config, "1", failed, runner, engineer)).toBe(true);
    expect(runner.queueTaskMessage).toHaveBeenCalledTimes(1);

    // A retry/resume re-reading the same attempt must not queue a duplicate.
    expect(
      deliverHandoffOutcome(config, "1", readHandoffStatus(config, "1"), runner, engineer),
    ).toBe(false);
    expect(runner.queueTaskMessage).toHaveBeenCalledTimes(1);

    // A genuinely new attempt gets its own outcome.
    beginHandoffStatus(config, "1", { attemptKey: "run-2" });
    const passed = finishHandoffStatus(config, "1", "run-2", { ok: true, step: "done" });
    expect(deliverHandoffOutcome(config, "1", passed, runner, engineer)).toBe(true);
    expect(runner.queueTaskMessage).toHaveBeenCalledTimes(2);
  });

  it("does not queue another message for a deferred attempt replayed with the same key", () => {
    const config = makeConfig();
    const runner = fakeRunner();
    const deferred = deferHandoffStatus(config, "1", "run-1", "read the queued message first");
    expect(deliverHandoffOutcome(config, "1", deferred, runner, engineer)).toBe(true);
    expect(
      deliverHandoffOutcome(config, "1", readHandoffStatus(config, "1"), runner, engineer),
    ).toBe(false);
    expect(runner.queueTaskMessage).toHaveBeenCalledTimes(1);
  });

  it("says what to do next on pass, fail and deferral", () => {
    const base = readHandoffStatus(makeConfig(), "1028");

    const pass = formatHandoffOutcomeMessage({ ...base, state: "passed", step: "done" });
    expect(pass).toContain("handoff passed");
    expect(pass).toContain("in review");
    expect(pass).toContain("Nothing further is needed");

    const fail = formatHandoffOutcomeMessage({
      ...base,
      state: "failed",
      step: "check",
      reason: "repoos check failed: test failure",
    });
    expect(fail).toContain("handoff failed at step check");
    expect(fail).toContain("repoos check failed: test failure");
    expect(fail).toContain("request handoff again");

    const deferred = formatHandoffOutcomeMessage({
      ...base,
      state: "deferred",
      step: "review",
      reason: "1 queued message(s) must be read before review",
    });
    expect(deferred).toContain("handoff deferred");
    expect(deferred).toContain("Read the queued message(s)");
  });

  it("collapses whitespace and caps the reason", () => {
    const flat = truncateHandoffReason("line one\n\nline two   end");
    expect(flat).toBe("line one line two end");
    expect(truncateHandoffReason("x".repeat(900))?.length).toBeLessThanOrEqual(
      HANDOFF_STATUS_REASON_LIMIT + "… (truncated)".length,
    );
    expect(truncateHandoffReason("   ")).toBeNull();
  });

  it("queues nothing when no engineer is configured", () => {
    const config = makeConfig();
    const runner = fakeRunner();
    const failed = finishHandoffStatus(config, "1", "run-1", {
      ok: false,
      step: "check",
      detail: "nope",
    });
    expect(deliverHandoffOutcome(config, "1", failed, runner, null)).toBe(false);
    expect(runner.queueTaskMessage).not.toHaveBeenCalled();
  });
});

describe("stale running handoff reconciliation (#1085)", () => {
  it("supersedes a running record with no live process", () => {
    const config = makeConfig();
    beginHandoffStatus(config, "1085", { attemptKey: "run-stale", step: "validate" });
    const superseded = reconcileHandoffStatus(config, "1085", {
      taskStatus: "review",
      handoffLive: false,
    });
    expect(superseded).toMatchObject({
      state: "superseded",
      reason: "task is already in review",
    });
    expect(readHandoffStatus(config, "1085").state).toBe("superseded");
  });

  it("supersedes when a newer review pass finished after the handoff started", () => {
    const config = makeConfig();
    beginHandoffStatus(config, "1080", {
      attemptKey: "run-old",
      step: "validate",
    });
    const started = readHandoffStatus(config, "1080").startedAt;
    expect(started).toBeTruthy();
    const later = new Date(Date.parse(started!) + 60_000).toISOString();
    const superseded = reconcileHandoffStatus(config, "1080", {
      taskStatus: "review",
      handoffLive: false,
      latestReviewAt: later,
    });
    expect(superseded).toMatchObject({
      state: "superseded",
      reason: "a newer review pass completed",
    });
  });

  it("does not supersede a live active handoff when a review finished after it started", () => {
    const config = makeConfig();
    beginHandoffStatus(config, "1085", { attemptKey: "run-live", step: "check" });
    const started = readHandoffStatus(config, "1085").startedAt!;
    const later = new Date(Date.parse(started) + 120_000).toISOString();
    const status = reconcileHandoffStatus(config, "1085", {
      taskStatus: "active",
      handoffLive: true,
      latestReviewAt: later,
    });
    expect(status.state).toBe("running");
  });

  it("flags a live handoff past the deadline as stale without persisting superseded", () => {
    const config = makeConfig();
    beginHandoffStatus(config, "1070", { attemptKey: "run-wait", step: "validate" });
    const stale = reconcileHandoffStatus(config, "1070", {
      taskStatus: "active",
      handoffLive: true,
      staleAfterMs: 60_000,
      nowMs: Date.now() + 120_000,
    });
    expect(stale.state).toBe("running");
    expect(stale.stale).toBe(true);
    expect(readHandoffStatus(config, "1070").state).toBe("running");
  });

  it("does not treat an orphan checkpoint marker as a live handoff (#1085)", () => {
    const config = makeConfig();
    mkdirSync(join(config.root, ".repoos/post-handoff-checkpoint"), { recursive: true });
    writeFileSync(
      join(config.root, ".repoos/post-handoff-checkpoint/1085.json"),
      JSON.stringify({
        taskId: "1085",
        approvedSha: "a".repeat(40),
        headSha: "b".repeat(40),
        phase: "gate",
        startedAt: new Date().toISOString(),
      }),
      "utf8",
    );
    const runner = {
      isHandoffInFlight: () => false,
      hasPendingHandoff: () => false,
    };
    expect(handoffProcessLive(config, "1085", runner)).toBe(false);
  });

  it("begins a fresh running record after supersede with a new attempt key", () => {
    const config = makeConfig();
    supersedeHandoffStatus(config, "1085", "orphan");
    const next = beginHandoffStatus(config, "1085", {
      attemptKey: "new-attempt",
      step: "validate",
    });
    expect(next.state).toBe("running");
    expect(readHandoffStatus(config, "1085").state).toBe("running");
  });

  it("emits handoff:superseded when reconciliation clears a running record", () => {
    const config = makeConfig();
    beginHandoffStatus(config, "1085", { attemptKey: "run-stale", step: "validate" });
    const before = readHandoffStatus(config, "1085");
    const events: Array<{ type: string; step?: string }> = [];
    const after = reconcileHandoffStatus(config, "1085", {
      taskStatus: "review",
      handoffLive: false,
    });
    emitHandoffSupersededIfNeeded(before, after, "1085", (e) =>
      events.push({ type: e.type, step: e.type === "task.progress" ? e.step : undefined }),
    );
    expect(events).toEqual([expect.objectContaining({ step: "handoff:superseded" })]);
  });
});

describe("engineer prompt handoff guidance (#1028)", () => {
  it("tells runner engineers to request handoff, end the turn, and not block on repoos review", () => {
    const config = makeConfig();
    const prompt = missionFor(makeTask(), "feat/handoff-status", "/tmp/worktree", engineer, config);
    expect(prompt).toContain("request handoff and END YOUR TURN");
    expect(prompt).toContain("Do NOT call the blocking `repoos review <id>`");
    expect(prompt).toContain("repoos handoff-status");
    expect(prompt).toContain("queues the outcome for your next turn");
  });
});
