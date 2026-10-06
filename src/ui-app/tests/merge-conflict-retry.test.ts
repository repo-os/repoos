/**
 * scheduleMergeConflictRetry (#0271 follow-up, repair handback #0679).
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
      agents: [{ name: "engineer", enabled: true, cli: "cursor", model: "test" }],
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

describe("scheduleMergeConflictRetry (#0271 follow-up, #0679)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("moves the task to active and resumes the engineer with the conflict detail", async () => {
    const fx = makeFixture();
    try {
      const task = readTask(fx);
      const { runner, calls } = makeFakeRunner();
      const scheduled = scheduleMergeConflictRetry(fx.config, task, REASON, runner);
      expect(scheduled).toBe(true);
      expect(calls.sent).toHaveLength(0);

      await vi.runAllTimersAsync();

      expect(calls.sent).toHaveLength(1);
      expect(calls.sent[0].message).toContain(REASON);
      expect(calls.sent[0].message).toContain("Merge main into your branch");
      expect(calls.failures).toHaveLength(0);

      const updated = readTask(fx);
      expect(updated.status).toBe("active");
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
      expect(calls.failures[0].reason).toContain("could not resume engineer");
    } finally {
      fx.clean();
    }
  });
});
