/**
 * #0657 — Archive: park a task without changing its status, keep its worktree,
 * and restore it later.
 *
 * These tests pin the model round-trip, the archive/unarchive action routes
 * (including the live-work refusal), the PATCH bypass guard, and the
 * dependency semantics of an archived upstream.
 */
import { describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseTask, serializeTask } from "../../core/task.js";
import { taskDependencyBlockers } from "../../core/task-dependencies.js";
import { patchTask, reviewAgain, taskAction } from "../../server/routes/tasks.js";
import { LiveIndex } from "../../server/live-index.js";
import type { RouteContext } from "../../server/routes/types.js";
import type { RepoOSConfig, Task } from "../../core/types.js";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function config(root: string): RepoOSConfig {
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

function taskText(status: string, extra = ""): string {
  return `---
id: "0657"
title: Archive fixture
type: feature
status: ${status}
priority: p2
area: core
assigned_to: ai
branch: feat/archive-fixture
${extra}---
Body
`;
}

interface Fixture {
  root: string;
  taskPath: string;
  config: RepoOSConfig;
  clean: () => void;
}

function makeFixture(status: string, extra = ""): Fixture {
  const root = mkdtempSync(join(tmpdir(), "repoos-archive-"));
  const workDir = join(root, "work");
  mkdirSync(workDir, { recursive: true });
  const taskPath = join(workDir, "0657-archive-fixture.md");
  writeFileSync(taskPath, taskText(status, extra));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["add", "-A"]);
  git(root, ["commit", "-qm", "initial"]);
  return {
    root,
    taskPath,
    config: config(root),
    clean: () => rmSync(root, { recursive: true, force: true }),
  };
}

function makeReq(body: unknown = {}): IncomingMessage {
  const data = Buffer.from(JSON.stringify(body), "utf8");
  return {
    [Symbol.asyncIterator]: async function* () {
      yield data;
    },
  } as unknown as IncomingMessage;
}

function makeRes(): { res: any; fake: { status: number; payload: any } } {
  const fake = { status: 0, payload: undefined as any };
  return {
    res: {
      writeHead(code: number) {
        fake.status = code;
      },
      end(p: string) {
        fake.payload = p ? JSON.parse(p) : undefined;
      },
    },
    fake,
  };
}

function readTaskFile(fx: Fixture): Task {
  return parseTask({
    content: readFileSync(fx.taskPath, "utf8"),
    absPath: fx.taskPath,
    root: fx.root,
    defaultStatus: fx.config.defaultStatus,
    defaultAssignee: fx.config.defaultAssignee,
  });
}

function makeCtx(
  fx: Fixture,
  opts: {
    runnerRunning?: boolean;
    reviewRunning?: boolean;
    previewRunning?: boolean;
    closeOutRunning?: boolean;
    /** Phase of a persisted close-out job; overrides closeOutRunning. */
    jobPhase?: string;
    handoffInFlight?: boolean;
  } = {},
): RouteContext {
  return {
    config: fx.config,
    index: {
      getTask: () => readTaskFile(fx),
      getTasks: () => [readTaskFile(fx)],
      applyFileChange: () => {},
    } as any,
    indexReady: Promise.resolve(),
    reviews: {
      isRunning: () => opts.reviewRunning ?? false,
      cancel: vi.fn(),
    } as any,
    runner: {
      isRunning: () => opts.runnerRunning ?? false,
      isHandoffInFlight: () => opts.handoffInFlight ?? false,
      hasPendingHandoff: () => false,
      stop: vi.fn(() => ({ stopped: true })),
    } as any,
    previews: {
      get: () => (opts.previewRunning ? { url: "http://x" } : null),
      stop: vi.fn(async () => {}),
    } as any,
    cto: {} as any,
    freeformRuns: {} as any,
    repoos: {} as any,
    emitEvent: () => {},
    closeOutLock: { closingOut: () => false } as any,
    rootLock: {} as any,
    jobCoordinator: {
      getJob: () =>
        opts.jobPhase
          ? { taskId: "0657", phase: opts.jobPhase }
          : opts.closeOutRunning
            ? { taskId: "0657", phase: "syncing" }
            : null,
      peekNext: () => null,
    } as any,
    reportedStages: {},
    triggerJobProcessing: () => {},
    pendingReview: new Set(),
    uiDir: null,
    reload: null,
    logger: {
      task: () => {},
      system: () => {},
      agent: () => {},
      getTaskLogs: () => [],
      getAgentLogs: () => [],
      getSystemLogs: () => [],
    } as any,
    onServerStatusChange: () => {},
    startUnifiedHandoff: () => ({ started: false, reason: "not wired" }),
    syncTaskBranch: async () => ({ ok: true, conflicts: [] }),
  };
}

describe("archive frontmatter round-trip (#0657)", () => {
  it("parses an existing file without the fields as not archived", () => {
    const fx = makeFixture("review");
    try {
      const t = readTaskFile(fx);
      expect(t.isArchived).toBe(false);
      expect(t.archiveDetail).toBeUndefined();
    } finally {
      fx.clean();
    }
  });

  it("round-trips is_archived and archive_detail through serialize/parse", () => {
    const fx = makeFixture("review");
    try {
      const t = readTaskFile(fx);
      t.isArchived = true;
      t.archiveDetail = "waiting on upstream";
      const text = serializeTask(t);
      const back = parseTask({
        content: text,
        absPath: fx.taskPath,
        root: fx.root,
        defaultStatus: fx.config.defaultStatus,
        defaultAssignee: fx.config.defaultAssignee,
      });
      expect(back.isArchived).toBe(true);
      expect(back.archiveDetail).toBe("waiting on upstream");
      expect(back.status).toBe("review");
    } finally {
      fx.clean();
    }
  });

  it("drops archive_detail when unarchived", () => {
    const fx = makeFixture("review", "is_archived: true\narchive_detail: shelved\n");
    try {
      const t = readTaskFile(fx);
      expect(t.isArchived).toBe(true);
      t.isArchived = false;
      t.archiveDetail = undefined;
      const back = parseTask({
        content: serializeTask(t),
        absPath: fx.taskPath,
        root: fx.root,
        defaultStatus: fx.config.defaultStatus,
        defaultAssignee: fx.config.defaultAssignee,
      });
      expect(back.isArchived).toBe(false);
      expect(back.archiveDetail).toBeUndefined();
    } finally {
      fx.clean();
    }
  });
});

describe("POST /api/tasks/:id/archive (#0657)", () => {
  it("shelves the task while preserving status and branch, and records the reason", async () => {
    const fx = makeFixture("review");
    try {
      const { res, fake } = makeRes();
      await taskAction(makeCtx(fx), makeReq({ detail: "exhausted review rounds" }), res, {
        param1: "0657",
        param2: "archive",
      });
      expect(fake.status).toBe(200);
      const t = readTaskFile(fx);
      expect(t.isArchived).toBe(true);
      expect(t.archiveDetail).toBe("exhausted review rounds");
      // Status and branch are untouched — archiving is orthogonal to lifecycle.
      expect(t.status).toBe("review");
      expect(t.branch).toBe("feat/archive-fixture");
      expect(t.body).toContain("archived: exhausted review rounds");
    } finally {
      fx.clean();
    }
  });

  it("omits the reason when none is given", async () => {
    const fx = makeFixture("active");
    try {
      const { res, fake } = makeRes();
      await taskAction(makeCtx(fx), makeReq({}), res, {
        param1: "0657",
        param2: "archive",
      });
      expect(fake.status).toBe(200);
      const t = readTaskFile(fx);
      expect(t.isArchived).toBe(true);
      expect(t.archiveDetail).toBeUndefined();
      expect(t.status).toBe("active");
      expect(t.body).toContain("- ");
      expect(t.body).toContain("archived");
    } finally {
      fx.clean();
    }
  });

  it("refuses while an agent run is live and writes nothing", async () => {
    const fx = makeFixture("active");
    try {
      const { res, fake } = makeRes();
      await taskAction(makeCtx(fx, { runnerRunning: true }), makeReq({}), res, {
        param1: "0657",
        param2: "archive",
      });
      expect(fake.status).toBe(409);
      expect(readTaskFile(fx).isArchived).toBe(false);
      expect(readTaskFile(fx).body).not.toContain("archived");
    } finally {
      fx.clean();
    }
  });

  it("refuses while a review is in progress", async () => {
    const fx = makeFixture("review");
    try {
      const { res, fake } = makeRes();
      await taskAction(makeCtx(fx, { reviewRunning: true }), makeReq({}), res, {
        param1: "0657",
        param2: "archive",
      });
      expect(fake.status).toBe(409);
      expect(readTaskFile(fx).isArchived).toBe(false);
    } finally {
      fx.clean();
    }
  });

  it("refuses while a preview is running", async () => {
    const fx = makeFixture("review");
    try {
      const { res, fake } = makeRes();
      await taskAction(makeCtx(fx, { previewRunning: true }), makeReq({}), res, {
        param1: "0657",
        param2: "archive",
      });
      expect(fake.status).toBe(409);
      expect(readTaskFile(fx).isArchived).toBe(false);
    } finally {
      fx.clean();
    }
  });

  it("refuses while a close-out job is queued or running", async () => {
    const fx = makeFixture("review");
    try {
      const { res, fake } = makeRes();
      await taskAction(makeCtx(fx, { closeOutRunning: true }), makeReq({}), res, {
        param1: "0657",
        param2: "archive",
      });
      expect(fake.status).toBe(409);
      expect(readTaskFile(fx).isArchived).toBe(false);
    } finally {
      fx.clean();
    }
  });

  it.each(["queued", "syncing", "validating", "publishing", "cleanup"])(
    "refuses while the close-out job is in the %s phase",
    async (jobPhase) => {
      const fx = makeFixture("review");
      try {
        const { res, fake } = makeRes();
        await taskAction(makeCtx(fx, { jobPhase }), makeReq({}), res, {
          param1: "0657",
          param2: "archive",
        });
        expect(fake.status).toBe(409);
        expect(readTaskFile(fx).isArchived).toBe(false);
      } finally {
        fx.clean();
      }
    },
  );

  it.each(["done", "failed"])(
    "archives a task whose old close-out job is %s (job files persist)",
    async (jobPhase) => {
      const fx = makeFixture("review");
      try {
        const { res, fake } = makeRes();
        await taskAction(makeCtx(fx, { jobPhase }), makeReq({}), res, {
          param1: "0657",
          param2: "archive",
        });
        expect(fake.status).toBe(200);
        expect(readTaskFile(fx).isArchived).toBe(true);
      } finally {
        fx.clean();
      }
    },
  );

  it("refuses while a handoff finalization is still in flight", async () => {
    const fx = makeFixture("active");
    try {
      const { res, fake } = makeRes();
      await taskAction(makeCtx(fx, { handoffInFlight: true }), makeReq({}), res, {
        param1: "0657",
        param2: "archive",
      });
      expect(fake.status).toBe(409);
      expect(fake.payload.error).toMatch(/handoff/);
      expect(readTaskFile(fx).isArchived).toBe(false);
    } finally {
      fx.clean();
    }
  });

  it("is rejected as a bare PATCH field (must use the action route)", async () => {
    const fx = makeFixture("review");
    try {
      const { res, fake } = makeRes();
      await patchTask(makeCtx(fx), makeReq({ archived: true }), res, { param1: "0657" });
      expect(fake.status).toBe(400);
      expect(fake.payload.error).toMatch(/archive/);
      expect(readTaskFile(fx).isArchived).toBe(false);
    } finally {
      fx.clean();
    }
  });

  it("refuses a generic status PATCH while archived", async () => {
    const fx = makeFixture("review", "is_archived: true\n");
    try {
      const { res, fake } = makeRes();
      await patchTask(makeCtx(fx), makeReq({ status: "active" }), res, { param1: "0657" });
      expect(fake.status).toBe(400);
      expect(fake.payload.error).toMatch(/archived/);
      expect(readTaskFile(fx).status).toBe("review");
    } finally {
      fx.clean();
    }
  });

  it("refuses to re-run the reviewer via /review-again while archived", async () => {
    const fx = makeFixture("review", "is_archived: true\n");
    try {
      const { res, fake } = makeRes();
      await reviewAgain(makeCtx(fx), makeReq({}), res, { param1: "0657" });
      expect(fake.status).toBe(400);
      expect(fake.payload.error).toMatch(/archived/);
    } finally {
      fx.clean();
    }
  });

  it("refuses to close out a parked task via /done", async () => {
    const fx = makeFixture("review", "is_archived: true\n");
    try {
      const { res, fake } = makeRes();
      await taskAction(makeCtx(fx), makeReq({}), res, {
        param1: "0657",
        param2: "done",
      });
      expect(fake.status).toBe(400);
      expect(fake.payload.error).toMatch(/archived/);
      expect(readTaskFile(fx).status).toBe("review");
    } finally {
      fx.clean();
    }
  });
});

describe("POST /api/tasks/:id/unarchive (#0657)", () => {
  it("clears both fields and restores the original status", async () => {
    const fx = makeFixture("review", "is_archived: true\narchive_detail: shelved\n");
    try {
      const { res, fake } = makeRes();
      await taskAction(makeCtx(fx), makeReq({}), res, {
        param1: "0657",
        param2: "unarchive",
      });
      expect(fake.status).toBe(200);
      const t = readTaskFile(fx);
      expect(t.isArchived).toBe(false);
      expect(t.archiveDetail).toBeUndefined();
      expect(t.status).toBe("review");
      expect(t.branch).toBe("feat/archive-fixture");
      expect(t.body).toContain("unarchived");
    } finally {
      fx.clean();
    }
  });

  it("refuses to unarchive a task that is not archived", async () => {
    const fx = makeFixture("active");
    try {
      const { res, fake } = makeRes();
      await taskAction(makeCtx(fx), makeReq({}), res, {
        param1: "0657",
        param2: "unarchive",
      });
      expect(fake.status).toBe(400);
    } finally {
      fx.clean();
    }
  });

  it("warns but still restores the status when the worktree is gone", async () => {
    const fx = makeFixture("review", "is_archived: true\narchive_detail: shelved\n");
    try {
      const { res, fake } = makeRes();
      // The default empty git info has worktreeExists: false, with a branch set.
      await taskAction(makeCtx(fx), makeReq({}), res, {
        param1: "0657",
        param2: "unarchive",
      });
      expect(fake.status).toBe(200);
      expect(fake.payload.warning).toMatch(/worktree is gone/);
      const t = readTaskFile(fx);
      expect(t.isArchived).toBe(false);
      expect(t.status).toBe("review");
    } finally {
      fx.clean();
    }
  });
});

describe("parser compatibility across the whole board (#0657)", () => {
  it("parses and round-trips every existing work/*.md", () => {
    const root = resolve(__dirname, "../../..");
    const workDir = join(root, "work");
    const files = readdirSync(workDir).filter((f) => f.endsWith(".md"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const absPath = join(workDir, file);
      const content = readFileSync(absPath, "utf8");
      const t = parseTask({
        content,
        absPath,
        root,
        defaultStatus: "inbox",
        defaultAssignee: "unassigned",
      });
      expect(t.id, `${file} must parse with an id`).toBeTruthy();
      const back = parseTask({
        content: serializeTask(t),
        absPath,
        root,
        defaultStatus: "inbox",
        defaultAssignee: "unassigned",
      });
      expect(back.isArchived).toBe(t.isArchived);
      expect(back.archiveDetail).toBe(t.archiveDetail);
      expect(back.status).toBe(t.status);
    }
  });
});

describe("archived tasks are excluded from work scans (#0657)", () => {
  function archiveTask(t: Task): Task {
    return { ...t, isArchived: true };
  }

  it("counts() omits archived tasks from column counters", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-live-"));
    try {
      const workDir = join(root, "work");
      mkdirSync(workDir, { recursive: true });
      writeFileSync(
        join(workDir, "0001-live.md"),
        `---\nid: "0001"\ntitle: Live\ntype: feature\nstatus: active\npriority: p2\narea: core\nassigned_to: ai\nbranch: feat/live\n---\nBody\n`,
      );
      writeFileSync(
        join(workDir, "0002-archived.md"),
        `---\nid: "0002"\ntitle: Archived\ntype: feature\nstatus: active\npriority: p2\narea: core\nassigned_to: ai\nbranch: feat/archived\nis_archived: true\n---\nBody\n`,
      );
      git(root, ["init", "-q"]);
      git(root, ["config", "user.email", "test@example.com"]);
      git(root, ["config", "user.name", "Test"]);
      git(root, ["add", "-A"]);
      git(root, ["commit", "-qm", "initial"]);
      const index = new LiveIndex(config(root));
      index.refreshAll();
      expect(index.counts().active).toBe(1);
      expect(index.archivedTasks().map((t) => t.id)).toEqual(["0002"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("an archived upstream keeps a dependent blocked", () => {
    const upstream = { id: "0001", status: "done", isArchived: true, body: "" } as Task;
    const dependent = { id: "0002", status: "ready", dependsOn: ["0001"], body: "" } as Task;
    const blockers = taskDependencyBlockers("/nonexistent", dependent, [upstream, dependent]);
    expect(blockers).toEqual([{ id: "0001", state: "archived" }]);
  });

  it("a non-archived done upstream does not block", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-dep-"));
    try {
      const run = (args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
      run(["init", "-q"]);
      run(["config", "user.email", "t@e.com"]);
      run(["config", "user.name", "T"]);
      writeFileSync(join(root, "f.txt"), "x");
      run(["add", "-A"]);
      run(["commit", "-qm", "initial"]);
      const commit = run(["rev-parse", "HEAD"]).trim();
      const upstream = {
        id: "0001",
        status: "done",
        branch: "feat/x",
        mergedCommit: commit,
        body: "",
      } as Task;
      const dependent = { id: "0002", status: "ready", dependsOn: ["0001"], body: "" } as Task;
      const blockers = taskDependencyBlockers(root, dependent, [upstream, dependent]);
      expect(blockers).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
