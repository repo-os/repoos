/**
 * scheduleMergeConflictRetry (#0271 follow-up).
 *
 * When a close-out's `validating` phase fails on a REAL, named merge
 * conflict, the engineer session is auto-resumed with the conflict detail
 * and asked to merge main into its OWN branch, resolve it, and re-submit —
 * mirroring `scheduleCheckFailureRetry`'s existing pattern for check
 * failures. Capped at MAX_MERGE_CONFLICT_RETRY_ATTEMPTS (2); on exhaustion
 * (or no engineer configured, or the resume itself fails) it gives up via
 * `persistHandoffFailure` instead of retrying forever.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig, Task } from "../../core/types";
import { parseTask } from "../../core/task";
import { scheduleMergeConflictRetry } from "../../server/handoff";
import type { AgentRunner } from "../../server/agents";

interface Fixture {
  root: string;
  taskPath: string;
  config: RepoOSConfig;
  clean: () => void;
}

function taskText(extra = ""): string {
  return `---
id: "0001"
title: Merge conflict retry fixture
type: feature
status: review
priority: p2
area: agent
assigned_to: ai
branch: feat/merge-conflict-fixture
${extra}---
Body
`;
}

function makeFixture(extra = ""): Fixture {
  const root = mkdtempSync(join(tmpdir(), "repoos-merge-retry-"));
  const taskPath = join(root, "work", "0001-fixture.md");
  mkdirSync(join(root, "work"), { recursive: true });
  writeFileSync(taskPath, taskText(extra));
  return {
    root,
    taskPath,
    config: {
      root,
      workDir: "work",
      docsDir: "docs",
      skillsDir: "skills",
      taskExtensions: [".md"],
      defaultStatus: "inbox",
      defaultAssignee: "unassigned",
      cacheDir: ".repoos",
    },
    clean: () => rmSync(root, { recursive: true, force: true }),
  };
}

function readTask(fx: Fixture): Task {
  return parseTask({
    content: readFileSync(fx.taskPath, "utf8"),
    absPath: fx.taskPath,
    root: fx.root,
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    git: {
      branchExists: false,
      worktreeExists: false,
      lastCommit: null,
      lastCommitAt: null,
      worktreePath: null,
      dirty: false,
    },
  });
}

interface FakeRunnerCalls {
  sent: { taskId: string; message: string }[];
  system: { taskId: string; message: string }[];
  failures: { taskId: string; reason: string }[];
}

function makeFakeRunner(sendOk = true): { runner: AgentRunner; calls: FakeRunnerCalls } {
  const calls: FakeRunnerCalls = { sent: [], system: [], failures: [] };
  const runner = {
    send: (taskId: string, message: string) => {
      calls.sent.push({ taskId, message });
      return sendOk ? { ok: true } : { ok: false, reason: "engineer session busy" };
    },
    system: (taskId: string, message: string) => {
      calls.system.push({ taskId, message });
    },
    persistHandoffFailure: (taskId: string, _task: Task | undefined, reason: string) => {
      calls.failures.push({ taskId, reason });
    },
  } as unknown as AgentRunner;
  return { runner, calls };
}

const REASON =
  "merge conflict in src/ui-app/src/components/TaskDrawer.vue — resolve it in the feature branch's own worktree (merge main into the branch), then retry";

describe("scheduleMergeConflictRetry (#0271 follow-up)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resumes the engineer with the conflict detail and persists an incrementing retry count", async () => {
    const fx = makeFixture();
    try {
      const task = readTask(fx);
      const { runner, calls } = makeFakeRunner();
      const scheduled = scheduleMergeConflictRetry(fx.config, task, REASON, runner);
      expect(scheduled).toBe(true);
      expect(calls.sent).toHaveLength(0); // delayed, not immediate

      await vi.runAllTimersAsync();

      expect(calls.sent).toHaveLength(1);
      expect(calls.sent[0].taskId).toBe("0001");
      expect(calls.sent[0].message).toContain(REASON);
      expect(calls.sent[0].message).toContain("merge main into your branch");
      expect(calls.failures).toHaveLength(0);

      const updated = readTask(fx);
      expect(updated.extra?.merge_conflict_retry_count).toBe(1);
    } finally {
      fx.clean();
    }
  });

  it("gives up via persistHandoffFailure after the retry cap is reached", async () => {
    // Simulate the task already having failed twice before (at the cap).
    const fx = makeFixture("merge_conflict_retry_count: 2\n");
    try {
      const task = readTask(fx);
      const { runner, calls } = makeFakeRunner();
      const scheduled = scheduleMergeConflictRetry(fx.config, task, REASON, runner);
      expect(scheduled).toBe(false);
      expect(calls.sent).toHaveLength(0);
      expect(calls.failures).toHaveLength(1);
      expect(calls.failures[0].reason).toContain("unresolved after 2 automatic retries");
    } finally {
      fx.clean();
    }
  });

  it("falls back to persistHandoffFailure when resuming the engineer session fails", async () => {
    const fx = makeFixture();
    try {
      const task = readTask(fx);
      const { runner, calls } = makeFakeRunner(false);
      const scheduled = scheduleMergeConflictRetry(fx.config, task, REASON, runner);
      expect(scheduled).toBe(true);

      await vi.runAllTimersAsync();

      expect(calls.failures).toHaveLength(1);
      expect(calls.failures[0].reason).toContain("could not auto-retry");
    } finally {
      fx.clean();
    }
  });
});
