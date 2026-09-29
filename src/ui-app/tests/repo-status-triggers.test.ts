/**
 * Sidebar git-state indicator (#0584) — trigger coverage.
 *
 * The indicator is only trustworthy if something notices. Three triggers are
 * specified; these tests pin the two that live in the server process:
 *
 *  1. the work watcher, including its explicit `.git/HEAD` · refs · index
 *     watches (the working-tree walk skips dot-directories, so a branch
 *     switch or an external commit is invisible without them);
 *  2. RepoOS's own commits and merges, which announce themselves through the
 *     git mutation hook and reach the emitted status end to end.
 *
 * Plus the `GET /api/repo/status` route contract, fail-closed included.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage } from "node:http";
import { rmFixture, waitFor } from "./helpers";
import { commitTaskFile } from "../../core/git.js";
import { onGitMutation, notifyGitMutation } from "../../core/git-activity.js";
import type { RepoOSConfig } from "../../core/types.js";
import { LiveIndex } from "../../server/live-index.js";
import { WorkWatcher } from "../../server/watcher.js";
import {
  createRepoStatusNotifier,
  isSameCheckout,
  resetRepoStatusCache,
  type RepoStatus,
} from "../../server/repo-status.js";
import { getRepoStatusRoute } from "../../server/routes/repo-log.js";
import type { RouteContext } from "../../server/routes/types.js";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
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
  } as RepoOSConfig;
}

/** A one-commit repo with a tracked file OUTSIDE the watched `work/` tree. */
function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-repo-status-trig-"));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "work"), { recursive: true });
  writeFileSync(join(root, "src", "app.ts"), "export const a = 1;\n");
  writeFileSync(join(root, "work", "0001-x.md"), '---\nid: "0001"\n---\nbody\n');
  git(root, ["add", "-A"]);
  git(root, ["commit", "-m", "init"]);
  return root;
}

describe("WorkWatcher git-state signal (#0584 trigger 1)", () => {
  let root: string;
  let index: LiveIndex;
  let watcher: WorkWatcher;
  let signals: number;
  let start: () => void;

  beforeEach(() => {
    root = makeRepo();
    signals = 0;
    const cfg = config(root);
    index = new LiveIndex(cfg);
    index.refreshAll();
    watcher = new WorkWatcher(cfg, index);
    watcher.setGitSignal(() => {
      signals += 1;
    });
    start = () => watcher.start();
  });

  afterEach(() => {
    watcher.stop();
    rmFixture(root);
  });

  it("signals on a write under the watched work directory", async () => {
    start();
    writeFileSync(join(root, "work", "0001-x.md"), '---\nid: "0001"\n---\nupdated\n');

    await waitFor(() => signals > 0, "git signal from a work/ write", 10_000);
    expect(signals).toBeGreaterThanOrEqual(1);
  });

  it("signals on an external commit that touches only .git", async () => {
    start();
    // No watched file changes here: `src/` is outside work/, so only the
    // explicit `.git` watches (index, refs, logs) can report this.
    writeFileSync(join(root, "src", "app.ts"), "export const a = 3;\n");
    git(root, ["commit", "-am", "chore: external commit"]);

    await waitFor(() => signals > 0, "git signal from an external commit", 10_000);
  });

  it("signals on a branch switch (HEAD moves)", async () => {
    git(root, ["checkout", "-q", "-b", "feat/other"]);
    git(root, ["checkout", "-q", "-"]);
    start();

    git(root, ["checkout", "feat/other"]);
    await waitFor(() => signals > 0, "git signal from a checkout", 10_000);
    git(root, ["checkout", "-"]);
  });

  it("signals when a change is only staged, not committed", async () => {
    start();
    writeFileSync(join(root, "src", "app.ts"), "export const a = 7;\n");
    await new Promise((r) => setTimeout(r, 300));
    expect(signals).toBe(0); // not watched — nothing to hear yet

    git(root, ["add", "src/app.ts"]); // rewrites .git/index only
    await waitFor(() => signals > 0, "git signal from staging a file", 10_000);
  });

  it("stays silent for changes outside the watched trees", async () => {
    start();
    writeFileSync(join(root, "src", "app.ts"), "export const a = 4;\n");
    await new Promise((r) => setTimeout(r, 500));
    expect(signals).toBe(0);
  });
});

describe("RepoOS commit → emitted status (triggers 1 + 2 wired together)", () => {
  let root: string;
  afterEach(() => {
    resetRepoStatusCache();
    if (root) rmFixture(root);
  });

  it("a task-file commit leaves the emitted state clean again", async () => {
    root = makeRepo();
    const emitted: RepoStatus[] = [];
    const notifier = createRepoStatusNotifier({
      root,
      emit: (s) => emitted.push(s),
      debounceMs: 5,
      minGapMs: 0,
    });
    // The same wiring server.ts installs: only mutations of THIS checkout.
    const off = onGitMutation((mutatedRoot) => {
      if (isSameCheckout(mutatedRoot, root)) notifier.notify();
    });
    try {
      await notifier.flush();
      expect(emitted).toHaveLength(1);
      expect(emitted[0]!.dirty).toEqual([]);
      emitted.length = 0;

      const abs = join(root, "src", "app.ts");
      writeFileSync(abs, "export const a = 5;\n");
      git(root, ["add", "-A"]);
      git(root, ["commit", "-m", "chore: stage"]);
      writeFileSync(abs, "export const a = 6;\n");
      expect(commitTaskFile(root, abs, "docs(0001): update task")).toBe(true);

      await waitFor(() => emitted.length > 0, "a repo.status emit after the commit", 15_000);
      // The commit landed: whatever the intermediate dirty flicker was, the
      // state we ended on is clean, with a new head.
      expect(emitted.at(-1)!.ok).toBe(true);
      expect(emitted.at(-1)!.dirty).toEqual([]);
    } finally {
      off();
      notifier.stop();
    }
  });

  it("reacts only to mutations of its own checkout, not a task worktree", async () => {
    root = makeRepo();
    const other = mkdtempSync(join(tmpdir(), "repoos-repo-status-wt-"));
    try {
      const notified: string[] = [];
      // The exact wiring server.ts installs: filter by checkout before
      // scheduling a recompute.
      const off = onGitMutation((mutatedRoot) => {
        if (isSameCheckout(mutatedRoot, root)) notified.push(mutatedRoot);
      });
      try {
        // A task worktree shares `.git` with the root checkout; its own
        // commit must not be read as "the main checkout changed".
        notifyGitMutation(other, "commit");
        expect(notified).toEqual([]);

        notifyGitMutation(root, "merge");
        expect(notified).toEqual([root]);
      } finally {
        off();
      }
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });
});

describe("GET /api/repo/status", () => {
  const makeRes = (): any => {
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
  };
  const makeReq = (): IncomingMessage =>
    ({
      [Symbol.asyncIterator]: async function* () {
        /* empty body */
      },
    }) as unknown as IncomingMessage;

  beforeEach(() => resetRepoStatusCache());
  afterEach(() => resetRepoStatusCache());

  it("answers 200 with the sidebar's snapshot shape", async () => {
    const root = makeRepo();
    try {
      const res = makeRes();
      const ctx = { config: config(root) } as unknown as RouteContext;
      await getRepoStatusRoute(ctx, makeReq(), res, {});

      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({
        ok: true,
        detached: false,
        dirty: [],
        path: root,
      });
      expect(typeof res.body.branch).toBe("string");
      expect(typeof res.body.head).toBe("string");
      expect(typeof res.body.computedAt).toBe("string");
      expect(res.body.recentCommits.length).toBeGreaterThan(0);
      expect(res.body.recentCommits[0]).toHaveProperty("shortSha");
    } finally {
      rmFixture(root);
    }
  });

  it("still answers 200 when git cannot be read — ok:false, never clean", async () => {
    const notARepo = mkdtempSync(join(tmpdir(), "repoos-repo-status-route-"));
    try {
      const res = makeRes();
      const ctx = { config: config(notARepo) } as unknown as RouteContext;
      await getRepoStatusRoute(ctx, makeReq(), res, {});

      expect(res.statusCode).toBe(200);
      expect(res.body.ok).toBe(false);
      expect(res.body.branch).toBeNull();
      expect(res.body.dirty).toEqual([]);
    } finally {
      rmSync(notARepo, { recursive: true, force: true });
    }
  });
});
