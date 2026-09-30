/**
 * Dirty-main guard regression tests (#0211).
 *
 * #0211: the move-to-done guard (`dirtyFiles` before enqueue) failed open — a
 * git error or timeout returned `[]`, which is indistinguishable from a clean
 * tree, so a close-out was enqueued against a dirty main and only failed at
 * publish time with git's raw "your local changes would be overwritten". These
 * tests pin the fail-closed behavior end to end through the `done` route:
 *
 *   1. a dirty main returns 409 + needsCommit and is never enqueued,
 *   2. a dirty check that itself errors (not a git repo) fails closed with 409
 *      and is never enqueued.
 */
import { describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmFixture } from "./helpers";
import { ensureWorktree } from "../../core/git.js";
import { createJobCoordinator } from "../../server/integration-job.js";
import { taskAction, getWorktreeDirtyForTask } from "../../server/routes/tasks.js";
import { readHandoffSnapshot, writeHandoffSnapshot } from "../../server/worktree-handoff-guard.js";
import type { RouteContext } from "../../server/routes/types.js";
import type { Task } from "../../core/types.js";

function makeRes(): any {
  const capture: any = {
    statusCode: 0,
    body: undefined,
    end: (data?: string) => {
      if (data) capture.body = JSON.parse(data);
    },
    writeHead: (status: number) => {
      capture.statusCode = status;
    },
  };
  return capture;
}

const makeReq = (): IncomingMessage =>
  ({
    [Symbol.asyncIterator]: async function* () {
      /* empty body */
    },
  }) as unknown as IncomingMessage;

/** A request with a JSON body, for the `commitDirty` opt-in. */
const makeReqWithBody = (body: unknown): IncomingMessage => {
  const raw = JSON.stringify(body);
  let sent = false;
  return {
    async *[Symbol.asyncIterator]() {
      if (sent) return;
      sent = true;
      yield Buffer.from(raw);
    },
  } as unknown as IncomingMessage;
};

const reviewTask = (root: string, over: Partial<Task> = {}): Task => ({
  id: "0211",
  title: "Test",
  type: "bug",
  status: "review",
  priority: "p1",
  area: "core",
  assignee: "ai",
  assignedTo: "ai",
  createdBy: "",
  branch: "feat/0211",
  tags: [],
  needsInput: false,
  needsMerge: false,
  noSourceChange: false,
  created_at: null,
  updated_at: null,
  path: "work/0211-test.md",
  absPath: join(root, "work/0211-test.md"),
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
  ...over,
});

function makeRepo(): { root: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-done-guard-"));
  const git = (args: string[]) => execSync(`git ${args.join(" ")}`, { cwd: root, stdio: "ignore" });
  git(["-C", root, "init", "-q"]);
  git(["config", "user.email", "t@example.com"]);
  git(["config", "user.name", "Test"]);
  mkdirSync(join(root, "work"), { recursive: true });
  writeFileSync(join(root, ".gitignore"), ".repoos/\n");
  writeFileSync(join(root, "README.md"), "hi\n");
  git(["add", ".gitignore", "README.md"]);
  git(["commit", "-m", "init"]);
  return { root, clean: () => rmFixture(root) };
}

function makeCtx(
  root: string,
  task: Task,
  opts: { onEnqueue?: () => void; jobCoordinator?: RouteContext["jobCoordinator"] } = {},
): RouteContext {
  const jobCoordinator =
    opts.jobCoordinator ??
    ({
      enqueue: opts.onEnqueue ?? (() => ({})),
      allJobs: () => [],
      updateJob: () => null,
    } as any);
  return {
    config: { root, workDir: "work", cacheDir: ".repoos" } as any,
    index: { getTask: () => task } as any,
    indexReady: Promise.resolve(),
    runner: { isRunning: () => false, stop: () => {} } as any,
    previews: { stop: async () => {} } as any,
    reviews: { isRunning: () => false, cancel: () => {} } as any,
    cto: {} as any,
    freeformRuns: {} as any,
    repoos: {} as any,
    emitEvent: () => {},
    closeOutLock: {} as any,
    rootLock: {} as any,
    jobCoordinator,
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
    syncTaskBranch: async () => ({ ok: true, conflicts: [] }),
    onServerStatusChange: () => {},
    // #0507: review transitions are requests, not writes -- these contexts
    // never move a task to review, so the handoff finalization is a no-op stub.
    startUnifiedHandoff: () => ({ started: false, reason: "not wired in this test" }),
  };
}

describe("GET worktree-dirty (#0512)", () => {
  it("lists the uncommitted work a restart would discard, minus generated/bookkeeping", async () => {
    const { root, clean } = makeRepo();
    try {
      const wt = makeFeatureWorktree(root);
      writeFileSync(join(wt, "src", "feature.ts"), "export const x = 2;\n// review fix\n");
      writeFileSync(join(wt, "work", "0999-other.md"), "---\nid: 0999\n---\nbookkeeping\n");
      const res = makeRes();

      await getWorktreeDirtyForTask(makeCtx(root, reviewTask(root)), makeReq(), res as any, {
        param1: "0211",
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.path).toBe(wt);
      expect(res.body.files).toEqual(["src/feature.ts"]);
    } finally {
      clean();
    }
  });

  it("fails closed (ok: false) rather than reporting a clean tree it could not read", async () => {
    // The whole point of this endpoint is to say what would be lost; "could not
    // tell" must never render as "nothing there".
    const notARepo = mkdtempSync(join(tmpdir(), "repoos-not-repo-wt-"));
    try {
      const task = reviewTask(notARepo, { branch: "feat/0211" });
      const res = makeRes();
      // A registered worktree that is not a usable checkout.
      writeFileSync(join(notARepo, "wt.txt"), "x\n");

      await getWorktreeDirtyForTask(makeCtx(notARepo, task), makeReq(), res as any, {
        param1: "0211",
      });

      // No registered worktree for the branch: an empty, honest answer.
      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({ ok: true, path: null, files: [] });
    } finally {
      rmSync(notARepo, { recursive: true, force: true });
    }
  });
});

describe("move-to-done dirty-main guard (#0211)", () => {
  it("returns 409 + needsCommit against a dirty main and never enqueues", async () => {
    const { root, clean } = makeRepo();
    try {
      // Dirty main: an uncommitted file exists in the working tree.
      writeFileSync(join(root, "dirty.txt"), "uncommitted\n");
      const task = reviewTask(root);
      const enqueue = vi.fn();
      const res = makeRes();

      await taskAction(makeCtx(root, task, { onEnqueue: enqueue }), makeReq(), res as any, {
        param1: "0211",
        param2: "done",
      });

      expect(res.statusCode).toBe(409);
      expect(res.body.needsCommit).toBe(true);
      expect(res.body.dirtyScope).toBe("main");
      expect(res.body.dirtyFiles).toContain("dirty.txt");
      expect(enqueue).not.toHaveBeenCalled();
    } finally {
      clean();
    }
  });

  it("fails closed when the dirty check errors and never enqueues", async () => {
    // A directory that is NOT a git repo makes `dirtyFiles` throw
    // GitDirtyCheckError; the route must surface a 409 and not enqueue.
    const notARepo = mkdtempSync(join(tmpdir(), "repoos-not-repo-"));
    try {
      const task = reviewTask(notARepo);
      const enqueue = vi.fn();
      const res = makeRes();

      await taskAction(makeCtx(notARepo, task, { onEnqueue: enqueue }), makeReq(), res as any, {
        param1: "0211",
        param2: "done",
      });

      expect(res.statusCode).toBe(409);
      expect(res.body.needsCommit).toBe(true);
      expect(res.body.dirtyCheckFailed).toBe(true);
      expect(enqueue).not.toHaveBeenCalled();
    } finally {
      rmSync(notARepo, { recursive: true, force: true });
    }
  });
});

/** A task worktree with a committed implementation, ready for the guard. */
function makeFeatureWorktree(root: string, branch = "feat/0211"): string {
  const wt = ensureWorktree(root, branch);
  if (!wt.ok) throw new Error(`could not create worktree: ${wt.reason ?? "unknown"}`);
  mkdirSync(join(wt.path, "src"), { recursive: true });
  writeFileSync(join(wt.path, "src", "feature.ts"), "export const x = 1;\n");
  mkdirSync(join(wt.path, "work"), { recursive: true });
  writeFileSync(
    join(wt.path, "work", "0211-test.md"),
    `---\nid: "0211"\ntitle: Test\nstatus: review\nbranch: ${branch}\n---\nBody\n`,
  );
  gitIn(wt.path, "add -A");
  gitIn(wt.path, 'commit -m "the work"');
  return wt.path;
}

function gitIn(cwd: string, args: string): string {
  return execSync(`git ${args}`, { cwd, encoding: "utf8" }).trimEnd();
}

describe("move-to-done dirty-WORKTREE guard (#0512)", () => {
  it("returns 409 + the file list and never enqueues when the worktree is dirty", async () => {
    const { root, clean } = makeRepo();
    try {
      const wt = makeFeatureWorktree(root);
      // A fix applied after the last handoff commit: never tested, never merged.
      writeFileSync(join(wt, "src", "feature.ts"), "export const x = 2;\n// review fix\n");
      const enqueue = vi.fn();
      const res = makeRes();

      await taskAction(
        makeCtx(root, reviewTask(root), { onEnqueue: enqueue }),
        makeReq(),
        res as any,
        {
          param1: "0211",
          param2: "done",
        },
      );

      expect(res.statusCode).toBe(409);
      expect(res.body.needsCommit).toBe(true);
      expect(res.body.dirtyScope).toBe("worktree");
      expect(res.body.dirtyFiles).toEqual(["src/feature.ts"]);
      expect(enqueue).not.toHaveBeenCalled();
      // Nothing touched yet: the human has not chosen.
      expect(gitIn(wt, "status --porcelain")).toContain("src/feature.ts");
    } finally {
      clean();
    }
  });

  it('"Commit & continue" commits on the task branch, then enqueues', async () => {
    const { root, clean } = makeRepo();
    try {
      const wt = makeFeatureWorktree(root);
      const handoffSha = gitIn(wt, "rev-parse HEAD");
      writeHandoffSnapshot(root, ".repoos", {
        taskId: "0211",
        branch: "feat/0211",
        sha: handoffSha,
        at: "2026-09-30T00:00:00Z",
        clean: true,
      });
      writeFileSync(join(wt, "src", "feature.ts"), "export const x = 2;\n// review fix\n");
      const coordinator = createJobCoordinator(root);
      const res = makeRes();

      await taskAction(
        makeCtx(root, reviewTask(root), { jobCoordinator: coordinator }),
        makeReqWithBody({ commitDirty: true }),
        res as any,
        { param1: "0211", param2: "done" },
      );

      expect(res.statusCode).toBe(200);
      const head = gitIn(wt, "rev-parse HEAD");
      const job = coordinator.getJob("0211");
      expect(job?.handoffSha).toBe(head);
      expect(head).not.toBe(handoffSha);
      const snap = readHandoffSnapshot(root, ".repoos", "0211");
      expect(snap?.sha).toBe(head);
      // The change landed on the task branch (which the merge gate then
      // validates) rather than being deleted with the worktree.
      expect(gitIn(wt, "status --porcelain")).toBe("");
      expect(gitIn(wt, "show HEAD:src/feature.ts")).toContain("review fix");
    } finally {
      clean();
    }
  });

  it("returns 409 with handoff conflict when HEAD moved since the snapshot", async () => {
    const { root, clean } = makeRepo();
    try {
      const wt = makeFeatureWorktree(root);
      const handoffSha = gitIn(wt, "rev-parse HEAD");
      writeHandoffSnapshot(root, ".repoos", {
        taskId: "0211",
        branch: "feat/0211",
        sha: handoffSha,
        at: "2026-09-30T00:00:00Z",
        clean: true,
      });
      writeFileSync(join(wt, "src", "extra.ts"), "export const y = 1;\n");
      gitIn(wt, "add src/extra.ts");
      gitIn(wt, 'commit -m "extra commit after handoff"');
      const coordinator = createJobCoordinator(root);
      const res = makeRes();

      await taskAction(
        makeCtx(root, reviewTask(root), { jobCoordinator: coordinator }),
        makeReq(),
        res as any,
        {
          param1: "0211",
          param2: "done",
        },
      );

      expect(res.statusCode).toBe(409);
      expect(res.body.worktreeChangedAfterHandoff).toBe(true);
      expect(res.body.resolutions).toEqual(["discard", "send-back"]);
      expect(coordinator.getJob("0211")).toBeNull();
    } finally {
      clean();
    }
  });

  it("ignores generated and bookkeeping dirt in the worktree", async () => {
    // `dist/` and the task dir are RepoOS's own churn — a check that builds in
    // the worktree, a task-file stamp. Blocking close-out on those would make
    // the guard fire on normal operation.
    const { root, clean } = makeRepo();
    try {
      const wt = makeFeatureWorktree(root);
      writeFileSync(join(wt, ".gitignore"), "dist/\n");
      gitIn(wt, "add .gitignore");
      gitIn(wt, 'commit -m "ignore dist"');
      mkdirSync(join(wt, "dist"), { recursive: true });
      writeFileSync(join(wt, "dist", "app.js"), "built\n");
      writeFileSync(join(wt, "work", "0999-other.md"), "---\nid: 0999\n---\nbookkeeping\n");
      const enqueue = vi.fn(() => ({ taskId: "0211", phase: "queued", enqueuedAt: "now" }));
      const res = makeRes();

      await taskAction(
        makeCtx(root, reviewTask(root), { onEnqueue: enqueue }),
        makeReq(),
        res as any,
        {
          param1: "0211",
          param2: "done",
        },
      );

      expect(res.statusCode).toBe(200);
      expect(enqueue).toHaveBeenCalledTimes(1);
    } finally {
      clean();
    }
  });
});
