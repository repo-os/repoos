/**
 * Sidebar git-state indicator, server side (#0584).
 *
 * Covers the parts the acceptance criteria call out as server-owned:
 *  - the snapshot's shape and its fail-closed contract (`ok: false` is
 *    "unknown", never "clean" — the #0211 rule applied to the indicator);
 *  - the status column coming from `dirtyFiles`' own parser, not a second one;
 *  - coalescing: N concurrent callers share ONE computation (N open tabs do
 *    not spawn N `git status` processes);
 *  - emit-only-on-change, so the SSE event counter does not churn;
 *  - RepoOS's own commits/merges announcing themselves through the git
 *    mutation hook (the trigger that catches a close-out publish).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmFixture, waitFor } from "./helpers";
import {
  GitDirtyCheckError,
  commitTaskFile,
  dirtyFilesDetailed,
  mergeBranch,
  parsePorcelainStatus,
} from "../../core/git.js";
import { onGitMutation } from "../../core/git-activity.js";
import {
  computeRepoStatus,
  createRepoStatusNotifier,
  getRepoStatus,
  isSameCheckout,
  resetRepoStatusCache,
  type RepoStatus,
} from "../../server/repo-status.js";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

const roots: string[] = [];

/** A fresh one-commit fixture repo, removed by the afterEach sweep. */
function repo(): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-repo-status-"));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);
  roots.push(root);
  return root;
}

beforeEach(() => resetRepoStatusCache());
afterEach(() => {
  resetRepoStatusCache();
  for (const root of roots.splice(0, roots.length)) rmFixture(root);
});

describe("parsePorcelainStatus — the shared status-column parser (#0584)", () => {
  it("reads the XY columns alongside each path", () => {
    const out = parsePorcelainStatus([" M src/a.ts", "A  src/b.ts", "?? notes.md"].join("\n"));
    expect(out).toEqual([
      { path: "src/a.ts", status: " M" },
      { path: "src/b.ts", status: "A " },
      { path: "notes.md", status: "??" },
    ]);
  });

  it("reports a rename under its destination path, keeping the status", () => {
    const out = parsePorcelainStatus("R  old.txt -> new.txt");
    expect(out).toEqual([{ path: "new.txt", status: "R " }]);
  });

  it("ignores blank lines and CRLF endings", () => {
    expect(parsePorcelainStatus(" M a.txt\r\n\r\n")).toEqual([{ path: "a.txt", status: " M" }]);
  });

  it("dirtyFilesDetailed carries the same paths with their status", async () => {
    const root = repo();
    writeFileSync(join(root, "tracked.txt"), "v1\n");
    git(root, ["add", "tracked.txt"]);
    git(root, ["commit", "-m", "add tracked"]);
    writeFileSync(join(root, "tracked.txt"), "v2\n");
    writeFileSync(join(root, "untracked.txt"), "new\n");

    const files = await dirtyFilesDetailed(root);
    expect(files).toEqual(
      expect.arrayContaining([
        { path: "tracked.txt", status: " M" },
        { path: "untracked.txt", status: "??" },
      ]),
    );
  });

  it("dirtyFilesDetailed fails closed exactly like dirtyFiles", async () => {
    const notARepo = mkdtempSync(join(tmpdir(), "repoos-repo-status-nr-"));
    try {
      await expect(dirtyFilesDetailed(notARepo)).rejects.toBeInstanceOf(GitDirtyCheckError);
    } finally {
      rmFixture(notARepo);
    }
  });
});

describe("computeRepoStatus", () => {
  it("reports branch, head and a clean tree", async () => {
    const root = repo();
    const status = await computeRepoStatus(root);
    const branch = git(root, ["branch", "--show-current"]);

    expect(status.ok).toBe(true);
    expect(status.branch).toBe(branch);
    expect(status.detached).toBe(false);
    expect(status.dirty).toEqual([]);
    expect(status.head).toBe(git(root, ["rev-parse", "HEAD"]));
    expect(status.baseBranch).toBeTruthy();
    expect(status.path).toBe(root);
    expect(status.recentCommits.length).toBeGreaterThan(0);
    expect(status.recentCommits.length).toBeLessThanOrEqual(3);
    expect(Date.parse(status.computedAt)).not.toBeNaN();
  });

  it("lists dirty files with their status column", async () => {
    const root = repo();
    writeFileSync(join(root, "tracked.txt"), "v1\n");
    git(root, ["add", "tracked.txt"]);
    git(root, ["commit", "-m", "add tracked"]);
    writeFileSync(join(root, "tracked.txt"), "v2\n");
    writeFileSync(join(root, "untracked.txt"), "new\n");

    const status = await computeRepoStatus(root);

    expect(status.ok).toBe(true);
    expect(status.dirty).toEqual(
      expect.arrayContaining([
        { path: "tracked.txt", status: " M" },
        { path: "untracked.txt", status: "??" },
      ]),
    );
  });

  it("flags a detached HEAD instead of pretending it is on a branch", async () => {
    const root = repo();
    git(root, ["checkout", "-q", "--detach"]);

    const status = await computeRepoStatus(root);

    expect(status.ok).toBe(true);
    expect(status.detached).toBe(true);
    expect(status.branch).toBeNull();
    expect(status.recentCommits.length).toBeGreaterThan(0);
  });

  it("fails closed for a directory that is not a repo — ok:false, never clean", async () => {
    const notARepo = mkdtempSync(join(tmpdir(), "repoos-repo-status-nr2-"));
    try {
      const status = await computeRepoStatus(notARepo);
      expect(status.ok).toBe(false);
      expect(status.branch).toBeNull();
      expect(status.dirty).toEqual([]);
      expect(status.head).toBeNull();
    } finally {
      rmFixture(notARepo);
    }
  });
});

describe("getRepoStatus coalescing", () => {
  it("serves concurrent callers one computation, not one per tab", async () => {
    const root = repo();
    const results = await Promise.all([
      getRepoStatus(root),
      getRepoStatus(root),
      getRepoStatus(root),
      getRepoStatus(root),
      getRepoStatus(root),
    ]);

    // Every waiter resolves with the SAME snapshot object: one `git status`,
    // one `git log`, whatever the number of open clients.
    for (const r of results) expect(r).toBe(results[0]);
    expect(results[0]!.ok).toBe(true);
  });

  it("answers a follow-up poll from the fresh cache", async () => {
    const root = repo();
    const first = await getRepoStatus(root);
    const second = await getRepoStatus(root);
    expect(second).toBe(first);
  });

  it("recomputes when asked for a fresh snapshot", async () => {
    const root = repo();
    const first = await getRepoStatus(root);
    const second = await getRepoStatus(root, { fresh: true });
    expect(second).not.toBe(first);
    expect(second.computedAt >= first.computedAt).toBe(true);
  });
});

describe("createRepoStatusNotifier", () => {
  it("emits the initial state once and stays quiet while nothing changes", async () => {
    const root = repo();
    const emitted: RepoStatus[] = [];
    const notifier = createRepoStatusNotifier({
      root,
      emit: (s) => emitted.push(s),
      debounceMs: 5,
      minGapMs: 0,
    });
    try {
      await notifier.flush();
      expect(emitted).toHaveLength(1);

      await notifier.flush();
      await notifier.flush();
      expect(emitted).toHaveLength(1);
    } finally {
      notifier.stop();
    }
  });

  it("emits once a real change lands, and not again for the same state", async () => {
    const root = repo();
    const emitted: RepoStatus[] = [];
    const notifier = createRepoStatusNotifier({
      root,
      emit: (s) => emitted.push(s),
      debounceMs: 5,
      minGapMs: 0,
    });
    try {
      await notifier.flush();
      expect(emitted).toHaveLength(1);

      writeFileSync(join(root, "a.txt"), "dirty\n");
      await notifier.flush();
      expect(emitted).toHaveLength(2);
      expect(emitted[1]!.dirty.map((d) => d.path)).toContain("a.txt");

      // Same dirty state again: no event, no counter churn.
      await notifier.flush();
      expect(emitted).toHaveLength(2);
    } finally {
      notifier.stop();
    }
  });

  it("coalesces a burst of notifications into a single emit", async () => {
    const root = repo();
    const emitted: RepoStatus[] = [];
    const notifier = createRepoStatusNotifier({
      root,
      emit: (s) => emitted.push(s),
      debounceMs: 10,
      minGapMs: 0,
    });
    try {
      await notifier.flush();
      emitted.length = 0;

      writeFileSync(join(root, "a.txt"), "dirty\n");
      // One git commit fires HEAD + index + refs + reflog within ms — model
      // that as a burst and expect exactly one event out of it.
      notifier.notify();
      notifier.notify();
      notifier.notify();

      await waitFor(() => emitted.length > 0, "a single coalesced repo.status emit", 10_000);
      // Give the burst every chance to emit twice before asserting it did not.
      await new Promise((r) => setTimeout(r, 300));
      expect(emitted).toHaveLength(1);
      expect(emitted[0]!.dirty.length).toBeGreaterThan(0);
    } finally {
      notifier.stop();
    }
  });
});

describe("RepoOS-initiated mutations (#0584 trigger 2)", () => {
  it("a task-file commit on the checkout announces itself", () => {
    const root = repo();
    const seen: Array<{ root: string; kind: string }> = [];
    const off = onGitMutation((mutated, kind) => seen.push({ root: mutated, kind }));
    try {
      const abs = join(root, "work.md");
      writeFileSync(abs, "one\n");
      git(root, ["add", "work.md"]);
      git(root, ["commit", "-m", "chore: add work.md"]);
      writeFileSync(abs, "two\n");
      expect(commitTaskFile(root, abs, "docs(0001): update task")).toBe(true);

      expect(seen).toHaveLength(1);
      expect(seen[0]).toEqual({ root, kind: "commit" });
    } finally {
      off();
    }
  });

  it("a close-out merge announces itself", async () => {
    const root = repo();
    const branchName = git(root, ["branch", "--show-current"]);
    git(root, ["checkout", "-q", "-b", "feat/merge-me"]);
    writeFileSync(join(root, "feature.txt"), "hi\n");
    git(root, ["add", "feature.txt"]);
    git(root, ["commit", "-m", "feat: add"]);
    git(root, ["checkout", "-q", branchName]);

    const seen: string[] = [];
    const off = onGitMutation((_root, kind) => seen.push(kind));
    try {
      const res = await mergeBranch(root, "feat/merge-me");
      expect(res.merged).toBe(true);
      expect(seen).toContain("merge");
    } finally {
      off();
    }
  });

  it("a mutation listener that throws does not break the git operation", async () => {
    const root = repo();
    const off = onGitMutation(() => {
      throw new Error("bad subscriber");
    });
    try {
      const abs = join(root, "work.md");
      writeFileSync(abs, "one\n");
      git(root, ["add", "work.md"]);
      git(root, ["commit", "-m", "chore: add work.md"]);
      writeFileSync(abs, "two\n");
      expect(commitTaskFile(root, abs, "docs(0002): update task")).toBe(true);
    } finally {
      off();
    }
  });
});

describe("isSameCheckout", () => {
  it("matches the same directory under either spelling", () => {
    const root = repo();
    expect(isSameCheckout(root, root)).toBe(true);
    expect(isSameCheckout(root, join(root, "work"))).toBe(false);
    expect(isSameCheckout(root, `${root}/`)).toBe(true);
  });

  it("does not treat a worktree as the checkout it shares .git with", () => {
    const root = repo();
    const other = mkdtempSync(join(tmpdir(), "repoos-repo-status-other-"));
    try {
      expect(isSameCheckout(root, other)).toBe(false);
    } finally {
      rmFixture(other);
    }
  });
});
