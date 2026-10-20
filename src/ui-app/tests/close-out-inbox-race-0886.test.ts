/**
 * #0886 — a task being closed out must never surface as `inbox`, and no
 * engineer write may land while Move to done owns it.
 *
 * The observed corruption: `mergeBranch` resolves the task file's conflict by
 * taking main's side, but a late "handoff requested (cli)" note wrote the file
 * again while it still had conflict markers. `parseDocument` treated git's
 * `=======` conflict divider as a frontmatter delimiter, so `status:` vanished
 * and the write committed `status: inbox`. These tests pin down each link:
 *
 *   1. a conflicted task file parses its real status, never the default;
 *   2. no task writer re-serializes a file with unresolved markers;
 *   3. the publish merge commit itself says `done` (stamped atomically);
 *   4. handoff requests/status moves are refused while the closing-out lock
 *      is present, and allowed again after a failed close-out drops it.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { rmFixture } from "./helpers";
import { ensureWorktree } from "../../core/git.js";
import { hasUnresolvedConflictMarkers, parseDocument } from "../../core/frontmatter.js";
import { parseTask, releasedAtFromActivity } from "../../core/task.js";
import { createRepoOS } from "../../core/repoos.js";
import { patchTaskFile, markTaskReleased } from "../../server/write.js";
import { handoffRequestPath, writeHandoffRequest } from "../../server/handoff-request.js";
import { finalizeReviewHandoff } from "../../server/handoff.js";
import { cmdMv } from "../../commands/tasks.js";
import { isTaskClosingOut, closingOutRefusal } from "../../server/close-out-lock.js";
import { createJobCoordinator } from "../../server/integration-job.js";
import { CloseOutOrchestrator } from "../../server/integration-orchestrator.js";
import { createRepositoryLock, createRootLock } from "../../server/repo-lock.js";
import {
  readWorktreeReviewLock,
  writeWorktreeReviewLock,
} from "../../server/worktree-handoff-guard.js";
import type { RepoOSConfig, Task } from "../../core/types.js";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function makeRepo(prefix = "repoos-0886-"): { root: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), prefix));
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  writeFileSync(join(root, ".gitignore"), ".repoos/\n");
  writeFileSync(join(root, "README.md"), "hi\n");
  git(root, ["add", ".gitignore", "README.md"]);
  git(root, ["commit", "-m", "init"]);
  return { root, clean: () => rmFixture(root) };
}

const TASK_ID = "0886";

function taskContent(status: string, activity = "- base"): string {
  return (
    `---\n` +
    `id: "${TASK_ID}"\n` +
    `title: Close-out inbox race\n` +
    `type: bug\n` +
    `status: ${status}\n` +
    `priority: p1\n` +
    `area: server\n` +
    `assigned_to: ai\n` +
    `branch: feat/inbox-race\n` +
    `---\n\n` +
    `## Problem\n\nx\n\n` +
    `## Activity\n\n${activity}\n`
  );
}

function writeTask(root: string, status: string, activity?: string): string {
  const path = join(root, "work", `${TASK_ID}-close-out-inbox-race.md`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, taskContent(status, activity));
  git(root, ["add", "work"]);
  git(root, ["commit", "-m", `docs(${TASK_ID}): task`]);
  return path;
}

function parseAt(root: string, absPath: string): Task {
  return parseTask({
    content: readFileSync(absPath, "utf8"),
    absPath,
    root,
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
  });
}

function configFor(root: string): RepoOSConfig {
  return {
    root,
    workDir: "work",
    cacheDir: ".repoos",
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
  } as RepoOSConfig;
}

// ---------------------------------------------------------------------------
// 1. The parser must never read a conflict divider as a frontmatter boundary.
// ---------------------------------------------------------------------------

describe("conflicted task frontmatter parses its real status (#0886)", () => {
  const conflicted = `---
id: "${TASK_ID}"
title: Close-out inbox race
type: bug
status: review
priority: p1
<<<<<<< HEAD
updated_at: "2026-10-21T17:08:29Z"
review_passes: 1
=======
updated_at: "2026-10-21T17:02:59Z"
review_passes: 3
>>>>>>> feat/inbox-race
assigned_to: ai
---

## Problem

x
`;

  it("reads review, not the parser default inbox", () => {
    const task = parseTask({
      content: conflicted,
      absPath: `/tmp/${TASK_ID}-x.md`,
      root: "/tmp",
      defaultStatus: "inbox",
      defaultAssignee: "unassigned",
    });
    expect(task.status).toBe("review");
    expect(task.updated_at).toBe("2026-10-21T17:02:59Z");
  });

  it("does not use a conflict divider as the closing delimiter", () => {
    const { data } = parseDocument(conflicted);
    expect(data.status).toBe("review");
    expect(data.assigned_to).toBe("ai");
  });

  it.each([
    ["=======", "======="],
    ["<<<<<<< HEAD", "<<<<<<< HEAD"],
    [">>>>>>> feat/x", ">>>>>>> feat/x"],
    ["||||||| base", "||||||| base"],
  ])("flags %s as an unresolved marker", (_label, marker) => {
    expect(hasUnresolvedConflictMarkers(`---\n${marker}\n---\n`)).toBe(true);
  });

  it("does not flag ordinary frontmatter, a markdown rule, or fenced prose", () => {
    expect(hasUnresolvedConflictMarkers("---\nstatus: review\n---\n")).toBe(false);
    expect(hasUnresolvedConflictMarkers("---\nstatus: review\n---\n\n---\n")).toBe(false);
    // A task may document a conflict in its body; that must never block a
    // legitimate task edit.
    expect(
      hasUnresolvedConflictMarkers(
        "---\nstatus: review\n---\n\n```\n<<<<<<< HEAD\n=======\n>>>>>>> x\n```\n",
      ),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. No writer may re-serialize a mid-merge task file.
// ---------------------------------------------------------------------------

describe("task writers refuse a file with unresolved conflict markers (#0886)", () => {
  it("patchTaskFile throws and leaves the file byte-for-byte unchanged", () => {
    const { root, clean } = makeRepo();
    try {
      const absPath = writeTask(root, "review");
      const conflicted = readFileSync(absPath, "utf8").replace(
        "status: review\n",
        "<<<<<<< HEAD\nstatus: review\n=======\nstatus: review\n>>>>>>> feat/inbox-race\n",
      );
      writeFileSync(absPath, conflicted);

      expect(() =>
        patchTaskFile(configFor(root), absPath, { note: "handoff requested (cli)" }),
      ).toThrow(/unresolved merge-conflict markers/i);
      expect(readFileSync(absPath, "utf8")).toBe(conflicted);
      expect(readFileSync(absPath, "utf8")).not.toMatch(/^status: inbox$/m);
    } finally {
      clean();
    }
  });

  it("the core RepoOS rewrite path (repoos mv/note) throws instead of committing inbox", () => {
    const { root, clean } = makeRepo();
    try {
      const absPath = writeTask(root, "review");
      const conflicted = readFileSync(absPath, "utf8").replace(
        "status: review\n",
        "<<<<<<< HEAD\nstatus: review\n=======\nstatus: review\n>>>>>>> feat/inbox-race\n",
      );
      writeFileSync(absPath, conflicted);
      const repoos = createRepoOS(root);
      expect(() => repoos.updateStatus(TASK_ID, "review")).toThrow(
        /unresolved merge-conflict markers/i,
      );
      expect(readFileSync(absPath, "utf8")).toBe(conflicted);
    } finally {
      clean();
    }
  });
});

// ---------------------------------------------------------------------------
// 3. The publish merge commit itself says done — never inbox, never review.
// ---------------------------------------------------------------------------

function makePublishFixture(options: { ff: boolean }): {
  root: string;
  clean: () => void;
  branchSha: string;
  baseMainSha: string;
  absPath: string;
} {
  const { root, clean } = makeRepo("repoos-0886-publish-");
  const absPath = writeTask(root, "review", "- base");

  if (options.ff) {
    // The candidate is a strict descendant of main: mergeBranch fast-forwards.
    const wt = ensureWorktree(root, `repoos/integrate/${TASK_ID}`).path!;
    mkdirSync(join(wt, "src"), { recursive: true });
    writeFileSync(join(wt, "src", "a.ts"), "export const x = 1;\n");
    writeFileSync(join(wt, "work", `${TASK_ID}-close-out-inbox-race.md`), taskContent("review"));
    git(wt, ["add", "src", "work"]);
    git(wt, ["commit", "-m", "candidate work"]);
    return {
      root,
      clean,
      branchSha: git(wt, ["rev-parse", "HEAD"]),
      baseMainSha: git(root, ["rev-parse", "main"]),
      absPath,
    };
  }

  // Non-ff: candidate is cut from main, then main advances on the same task
  // file, so the publish merge has a real task-file conflict (the exact shape
  // that produced the inbox write).
  const wt = ensureWorktree(root, `repoos/integrate/${TASK_ID}`).path!;
  mkdirSync(join(wt, "src"), { recursive: true });
  writeFileSync(join(wt, "src", "a.ts"), "export const x = 1;\n");
  writeFileSync(
    join(wt, "work", `${TASK_ID}-close-out-inbox-race.md`),
    taskContent("review", "- candidate log"),
  );
  git(wt, ["add", "src", "work"]);
  git(wt, ["commit", "-m", "candidate work"]);

  writeFileSync(absPath, taskContent("review", "- main log"));
  git(root, ["add", "work"]);
  git(root, ["commit", "-m", "main bookkeeping moved"]);

  return {
    root,
    clean,
    branchSha: git(wt, ["rev-parse", "HEAD"]),
    baseMainSha: git(root, ["rev-parse", "main"]),
    absPath,
  };
}

async function runPublish(options: { ff: boolean }): Promise<{
  root: string;
  clean: () => void;
  absPath: string;
  branchSha: string;
  job: ReturnType<ReturnType<typeof createJobCoordinator>["getJob"]>;
}> {
  const fixture = makePublishFixture(options);
  const cfg = configFor(fixture.root);
  const coordinator = createJobCoordinator(fixture.root);
  const getTask = (id: string): Task | null => {
    if (id !== TASK_ID) return null;
    return parseAt(fixture.root, fixture.absPath);
  };
  const orchestrator = new CloseOutOrchestrator(
    cfg,
    coordinator,
    createRepositoryLock(fixture.root),
    createRootLock(fixture.root),
    getTask,
  );
  const branch = `repoos/integrate/${TASK_ID}`;
  coordinator.enqueue({ id: TASK_ID, branch } as never);
  coordinator.updateJob(TASK_ID, {
    phase: "publishing",
    startedAt: new Date().toISOString(),
    baseMainSha: fixture.baseMainSha,
    branchSha: fixture.branchSha,
    candidateSha: fixture.branchSha,
  });

  await orchestrator.processNext();
  return {
    root: fixture.root,
    clean: fixture.clean,
    absPath: fixture.absPath,
    branchSha: fixture.branchSha,
    job: coordinator.getJob(TASK_ID),
  };
}

describe("the publish commit stamps status done atomically (#0886)", () => {
  it("a merge commit carries status: done and the merged commit, never inbox", async () => {
    const run = await runPublish({ ff: false });
    try {
      expect(run.job?.phase).toBe("done");
      // The merge commit itself carries the final status. The release marker
      // is a later bookkeeping commit, so assert on the merge, not HEAD.
      const mergeSubject = git(run.root, ["log", "-1", "--format=%s", "HEAD^"]);
      expect(mergeSubject).toBe(`Merge branch 'repoos/integrate/${TASK_ID}'`);

      const contentAtHead = git(run.root, [
        "show",
        `HEAD^:work/${TASK_ID}-close-out-inbox-race.md`,
      ]);
      expect(contentAtHead).toMatch(/^status: done$/m);
      expect(contentAtHead).toMatch(new RegExp(`^merged_commit: "?${run.branchSha}"?$`, "m"));
      expect(contentAtHead).not.toMatch(/^status: inbox$/m);

      const released = parseAt(run.root, run.absPath);
      expect(released.status).toBe("done");
      expect(released.mergedCommit).toBe(run.branchSha);
      // The release marker still lands exactly once, after the merge.
      expect(releasedAtFromActivity(released.body)).toBeTruthy();
    } finally {
      run.clean();
    }
  }, 30_000);

  it("a fast-forward publish stamps done in its own commit before cleanup", async () => {
    const run = await runPublish({ ff: true });
    try {
      expect(run.job?.phase).toBe("done");
      // A fast-forward has no RepoOS merge commit to amend; the stamp is the
      // commit right after it, before the slow post-merge work.
      expect(git(run.root, ["log", "-1", "--format=%s", "HEAD^"])).toBe(
        `docs(${TASK_ID}): set status done`,
      );
      const contentAtHead = git(run.root, [
        "show",
        `HEAD^:work/${TASK_ID}-close-out-inbox-race.md`,
      ]);
      expect(contentAtHead).toMatch(/^status: done$/m);
      expect(contentAtHead).not.toMatch(/^status: inbox$/m);
    } finally {
      run.clean();
    }
  }, 30_000);

  it("markTaskReleased records the release marker for a stamped done task", () => {
    const { root, clean } = makeRepo();
    try {
      const absPath = writeTask(root, "review");
      const config = configFor(root);
      // Simulate the publish stamp: status done, no release marker yet.
      writeFileSync(absPath, taskContent("done"));
      const released = markTaskReleased(config, absPath, "abc123");
      expect(released.status).toBe("done");
      expect(released.mergedCommit).toBe("abc123");
      expect(releasedAtFromActivity(released.body)).toBeTruthy();
    } finally {
      clean();
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Closing-out fence: every phase, and the retry path afterwards.
// ---------------------------------------------------------------------------

describe("engineer writes are refused while a task is closing out (#0886)", () => {
  const phases = ["gate", "merge", "publish", "release"];

  it.each(phases)("a handoff during the %s phase is rejected and writes nothing", async (phase) => {
    const { root, clean } = makeRepo(`repoos-0886-fence-${phase}-`);
    try {
      const absPath = writeTask(root, "review");
      const config = configFor(root);
      writeWorktreeReviewLock(root, ".repoos", TASK_ID, {
        status: "closing-out",
        sha: git(root, ["rev-parse", "HEAD"]),
        at: new Date().toISOString(),
      });
      const before = readFileSync(absPath, "utf8");

      expect(isTaskClosingOut(root, ".repoos", TASK_ID)).toBe(true);
      expect(closingOutRefusal(TASK_ID)).toMatch(/being closed out/i);

      // The runner handoff-request marker: never written, so no later turn can
      // mistake a mid-close-out request for a fresh one.
      const wroteRequest = writeHandoffRequest(root, ".repoos", {
        taskId: TASK_ID,
        runId: `run-${phase}`,
        at: new Date().toISOString(),
        source: "repoos-mv",
      });
      expect(wroteRequest).toBe(false);
      expect(existsSync(handoffRequestPath(root, ".repoos", TASK_ID))).toBe(false);

      // The non-runner handoff path: rejected at validation, before any check
      // or task-file write.
      const result = await finalizeReviewHandoff(config, parseAt(root, absPath));
      expect(result.ok).toBe(false);
      expect(result.step).toBe("validate");
      expect(result.detail).toMatch(/being closed out/i);
      expect(readFileSync(absPath, "utf8")).toBe(before);
    } finally {
      clean();
    }
  });

  it("repoos mv is refused and writes nothing while the closing-out lock is present", () => {
    const { root, clean } = makeRepo("repoos-0886-cmdmv-");
    const prevCwd = process.cwd();
    const prevExitCode = process.exitCode;
    try {
      const absPath = join(root, "work", `${TASK_ID}-close-out-inbox-race.md`);
      // `repoos mv` is board-rooted; give the fixture the minimal config it
      // reads and run from inside it.
      writeFileSync(join(root, "repoos.toml"), "");
      writeTask(root, "review");
      writeWorktreeReviewLock(root, ".repoos", TASK_ID, {
        status: "closing-out",
        sha: git(root, ["rev-parse", "HEAD"]),
        at: new Date().toISOString(),
      });
      const before = readFileSync(absPath, "utf8");
      process.chdir(root);
      process.exitCode = 0;
      cmdMv(TASK_ID, "review");
      expect(process.exitCode).toBe(1);
      expect(readFileSync(absPath, "utf8")).toBe(before);
    } finally {
      process.chdir(prevCwd);
      process.exitCode = prevExitCode;
      clean();
    }
  });

  it("allows the retry once a failed close-out drops the lock back to review", () => {
    const { root, clean } = makeRepo("repoos-0886-retry-");
    try {
      writeTask(root, "review");
      writeWorktreeReviewLock(root, ".repoos", TASK_ID, {
        status: "review",
        sha: git(root, ["rev-parse", "HEAD"]),
        at: new Date().toISOString(),
      });
      expect(readWorktreeReviewLock(root, ".repoos", TASK_ID)?.status).toBe("review");
      expect(isTaskClosingOut(root, ".repoos", TASK_ID)).toBe(false);
      expect(
        writeHandoffRequest(root, ".repoos", {
          taskId: TASK_ID,
          runId: "run-retry",
          at: new Date().toISOString(),
          source: "repoos-mv",
        }),
      ).toBe(true);
    } finally {
      clean();
    }
  });
});
