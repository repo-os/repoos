/**
 * Handoff outcome reporting (#1028): a non-blocking status store plus exactly
 * one queued message for the engineer's next turn.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Agent, RepoOSConfig, Task } from "../../core/types";
import { missionFor } from "../../server/agents";
import {
  beginHandoffStatus,
  deferHandoffStatus,
  deliverHandoffOutcome,
  finishHandoffStatus,
  formatHandoffOutcomeMessage,
  readHandoffStatus,
  truncateHandoffReason,
  updateHandoffStatusStep,
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
