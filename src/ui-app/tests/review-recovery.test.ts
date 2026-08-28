import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { RepoOSConfig, Task } from "../../core/types";
import { parseTask } from "../../core/task";
import { ensureWorktree } from "../../core/git";
import { ReviewManager } from "../../server/review";

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
    agents: [
      { name: "reviewer", cli: "opencode", model: "deepinfra/m", enabled: true },
    ],
  } as RepoOSConfig;
}

let root: string;
let cfg: RepoOSConfig;
let reviews: ReviewManager;
let branch: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "repoos-review-recovery-"));
  mkdirSync(join(root, "work"), { recursive: true });
  mkdirSync(join(root, ".repoos", "reviews"), { recursive: true });
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);

  branch = "feat/recover-me";
  const wt = ensureWorktree(root, branch);
  if (!wt.ok) throw new Error(wt.reason);
  writeFileSync(join(wt.path, "impl.ts"), "export const x = 1;\n");
  git(wt.path, ["add", "-A"]);
  git(wt.path, ["commit", "-q", "-m", "engineer work"]);

  cfg = config(root);
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  reviews = new ReviewManager(cfg, () => {});
  vi.spyOn(reviews, "run").mockResolvedValue({ ok: true } as never);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
  try {
    git(root, ["worktree", "prune"]);
  } catch {
    /* ignore */
  }
  rmSync(join(root, "..", `${basename(root)}-worktrees`), {
    recursive: true,
    force: true,
  });
});

function reviewTask(): Task {
  return parseTask({
    content: `---\nid: "0001"\ntitle: Recover me\ntype: feature\nstatus: review\npriority: p1\narea: server\nbranch: ${branch}\n---\nbody\n`,
    absPath: join(root, "work", "0001-recover.md"),
    root,
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
  });
}

function writeReport(atISO: string): void {
  writeFileSync(
    join(root, ".repoos", "reviews", "0001.md"),
    `---\ntask: "0001"\nat: "${atISO}"\nagent: reviewer\ncli: opencode\nmodel: m\nbranch: ${branch}\nstate: ok\n---\n## Verdict\nneeds some work\n`,
  );
}

describe("ReviewManager.recoverInterruptedReviews", () => {
  it("re-reviews a review task with no stored report", async () => {
    reviews.recoverInterruptedReviews([reviewTask()]);
    await vi.advanceTimersByTimeAsync(100);
    expect(reviews.run).toHaveBeenCalledOnce();
  });

  it("re-reviews when the report predates the branch HEAD commit", async () => {
    writeReport("2000-01-01T00:00:00.000Z"); // ancient — older than the commit
    reviews.recoverInterruptedReviews([reviewTask()]);
    await vi.advanceTimersByTimeAsync(100);
    expect(reviews.run).toHaveBeenCalledOnce();
  });

  it("does NOT re-review when the report is newer than the branch HEAD", async () => {
    writeReport(new Date(Date.now() + 60_000).toISOString());
    reviews.recoverInterruptedReviews([reviewTask()]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(reviews.run).not.toHaveBeenCalled();
  });

  it("skips tasks that are not in review", async () => {
    reviews.recoverInterruptedReviews([parseTask({
      content: `---\nid: "0002"\ntitle: Done\ntype: feature\nstatus: done\npriority: p1\narea: server\nbranch: ${branch}\n---\nbody\n`,
      absPath: join(root, "work", "0002.md"),
      root,
      defaultStatus: "inbox",
      defaultAssignee: "unassigned",
    })]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(reviews.run).not.toHaveBeenCalled();
  });

  it("skips a deliberately cancelled review", async () => {
    writeFileSync(
      join(root, ".repoos", "reviews", ".cancelled.json"),
      JSON.stringify({ taskIds: ["0001"] }),
    );
    reviews.recoverInterruptedReviews([reviewTask()]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(reviews.run).not.toHaveBeenCalled();
  });
});
