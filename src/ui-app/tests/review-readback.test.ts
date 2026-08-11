/**
 * 0077 — review-status readback hardening.
 *
 * Two halves:
 *
 * 1. Worktree-aware root resolution: `repoos show`/`list`/`index` must resolve
 *    to the MAIN checkout even when run from inside a task worktree (a
 *    worktree's `.git` is a FILE pointing at `<main>/.git/worktrees/<name>`),
 *    so a readback can never false-positive on the worktree's own copy — the
 *    #0068 shape.
 *
 * 2. Defense-in-depth self-heal in AgentRunner: when a turn ends with the main
 *    copy of the task still `active` but the worktree copy committed to
 *    `review`/`needs_input`, the server patches the main copy to match and
 *    surfaces the correction. Built against real git repos + linked worktrees.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  boardRoot,
  findRepoRoot,
  isLinkedWorktreeRoot,
  mainCheckoutRoot,
} from "../../core/config";
import { ensureWorktree } from "../../core/git";
import { AgentRunner } from "../../server/agents";
import type { Agent, RepoOSConfig, Task } from "../../core/types";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

/** git reports real paths (macOS /var -> /private/var); compare normalized. */
const rp = (p: string): string => realpathSync(p);

function makeRepo(): { root: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-rb-"));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);
  return { root, clean: () => rmSync(root, { recursive: true, force: true }) };
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

const TASK_MD = (status: string, needsInput = false): string =>
  `---
id: "0068"
title: Add Cloudflare Tunnel
type: feature
status: ${status}
${needsInput ? "needs_input: true\n" : ""}priority: p2
area: core
assigned_to: ai
branch: feat/0068
created_at: "2026-08-11T00:00:00Z"
updated_at: "2026-08-11T00:00:00Z"
---
## Problem

Body.
`;

const task = (root: string): Task => ({
  id: "0068",
  title: "Add Cloudflare Tunnel",
  type: "feature",
  status: "active",
  priority: "p2",
  area: "core",
  assignee: "ai",
  assignedTo: "ai",
  createdBy: "",
  branch: "feat/0068",
  tags: [],
  needsInput: false,
  needsMerge: false,
  created_at: null,
  updated_at: null,
  path: "work/0068-tunnel.md",
  absPath: join(root, "work", "0068-tunnel.md"),
  body: "",
  extra: {},
  git: {
    branchExists: true,
    worktreeExists: true,
    lastCommit: null,
    lastCommitAt: null,
    worktreePath: null,
    dirty: false,
  },
});

const agent = (cli: string): Agent => ({ name: "engineer", cli, model: "big pickle", enabled: true });

async function waitFor(fn: () => boolean, label: string, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

/**
 * A real git repo whose main checkout holds the task at `mainStatus` and whose
 * linked worktree (`feat/0068`) holds it at `worktreeStatus`. The worktree
 * edit is committed when `commitWorktree` is true (the #0068 incident had a
 * real commit backing the worktree's review state).
 */
function makeDivergenceFixture(opts: {
  mainStatus: string;
  worktreeStatus: string;
  worktreeNeedsInput?: boolean;
  commitWorktree: boolean;
}): { root: string; wt: string; clean: () => void } {
  const { root, clean } = makeRepo();
  mkdirSync(join(root, "work"), { recursive: true });
  writeFileSync(join(root, "work", "0068-tunnel.md"), TASK_MD(opts.mainStatus));
  git(root, ["add", "-A"]);
  git(root, ["commit", "-m", "add task"]);
  const wtRes = ensureWorktree(root, "feat/0068");
  if (!wtRes.ok) throw new Error("could not create worktree");
  const wt = wtRes.path;
  writeFileSync(
    join(wt, "work", "0068-tunnel.md"),
    TASK_MD(opts.worktreeStatus, opts.worktreeNeedsInput),
  );
  if (opts.commitWorktree) {
    git(wt, ["add", "-A"]);
    git(wt, ["commit", "-m", "docs(0068): set status review"]);
  }
  return { root, wt, clean };
}

/** Fake `claude` on PATH that emits a line and exits — no real agent needed. */
function fakeBins(): { restorePath: string; clean: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "repoos-rb-bin-"));
  const bin = join(dir, "bin");
  mkdirSync(bin, { recursive: true });
  const fake = `#!/usr/bin/env node
const fs = require("fs");
fs.appendFileSync(process.env.REPOOS_FAKEBIN_LOG, "spawned\\n");
process.stdout.write("fake output line\\n");
`;
  for (const name of ["claude", "qwen", "codex"]) {
    writeFileSync(join(bin, name), fake, { mode: 0o755 });
  }
  const oldPath = process.env.PATH ?? "";
  process.env.PATH = `${bin}:${oldPath}`;
  process.env.REPOOS_FAKEBIN_LOG = join(dir, "spawns.log");
  return {
    restorePath: oldPath,
    clean: () => rmSync(dir, { recursive: true, force: true }),
  };
}

describe("worktree-aware root resolution (#0077)", () => {
  it("distinguishes a linked worktree from a real repo root", () => {
    const { root, clean } = makeRepo();
    try {
      expect(isLinkedWorktreeRoot(root)).toBe(false);
      expect(mainCheckoutRoot(root)).toBeNull();

      const wtRes = ensureWorktree(root, "feat/0077");
      expect(wtRes.ok).toBe(true);
      const wt = wtRes.path;

      // The worktree's `.git` is a FILE, not a directory.
      expect(isLinkedWorktreeRoot(wt)).toBe(true);
      // The pointer resolves back to the main checkout.
      expect(rp(mainCheckoutRoot(wt)!)).toBe(rp(root));

      // findRepoRoot keeps nearest-root semantics (mutating commands act on
      // the directory they run in)…
      expect(rp(findRepoRoot(wt))).toBe(rp(wt));
      // …while board reads resolve through to the MAIN checkout.
      expect(rp(boardRoot(wt).root)).toBe(rp(root));
      expect(boardRoot(wt).fromWorktree).toBe(true);
      expect(boardRoot(root)).toEqual({ root, fromWorktree: false });
    } finally {
      clean();
    }
  });
});

describe("self-heal defense-in-depth (#0077)", () => {
  it("patches main to review when a turn ends with main still active but the worktree copy is committed to review", async () => {
    const fx = makeDivergenceFixture({
      mainStatus: "active",
      worktreeStatus: "review",
      commitWorktree: true,
    });
    const bins = fakeBins();
    try {
      const runner = new AgentRunner(config(fx.root), () => {});
      const started = runner.start(task(fx.root), "feat/0068", agent("claude code"), { cwd: fx.wt });
      expect(started.ok).toBe(true);
      await waitFor(() => !runner.isRunning("0068"), "agent turn exit");

      const mainText = readFileSync(join(fx.root, "work", "0068-tunnel.md"), "utf8");
      expect(mainText).toContain("status: review");
    } finally {
      process.env.PATH = bins.restorePath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      fx.clean();
      bins.clean();
    }
  });

  it("patches main to needs_input when the committed worktree copy flags the human", async () => {
    const fx = makeDivergenceFixture({
      mainStatus: "active",
      worktreeStatus: "active",
      worktreeNeedsInput: true,
      commitWorktree: true,
    });
    const bins = fakeBins();
    try {
      const runner = new AgentRunner(config(fx.root), () => {});
      runner.start(task(fx.root), "feat/0068", agent("claude code"), { cwd: fx.wt });
      await waitFor(() => !runner.isRunning("0068"), "agent turn exit");

      const mainText = readFileSync(join(fx.root, "work", "0068-tunnel.md"), "utf8");
      expect(mainText).toContain("needs_input: true");
      expect(mainText).toContain("status: active");
    } finally {
      process.env.PATH = bins.restorePath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      fx.clean();
      bins.clean();
    }
  });

  it("does NOT heal when the worktree edit is uncommitted (must be commit-backed)", async () => {
    const fx = makeDivergenceFixture({
      mainStatus: "active",
      worktreeStatus: "review",
      commitWorktree: false,
    });
    const bins = fakeBins();
    try {
      const runner = new AgentRunner(config(fx.root), () => {});
      runner.start(task(fx.root), "feat/0068", agent("claude code"), { cwd: fx.wt });
      await waitFor(() => !runner.isRunning("0068"), "agent turn exit");

      const mainText = readFileSync(join(fx.root, "work", "0068-tunnel.md"), "utf8");
      expect(mainText).toContain("status: active");
    } finally {
      process.env.PATH = bins.restorePath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      fx.clean();
      bins.clean();
    }
  });

  it("does NOT heal when main is no longer active (a human already moved it)", async () => {
    const fx = makeDivergenceFixture({
      mainStatus: "ready",
      worktreeStatus: "review",
      commitWorktree: true,
    });
    const bins = fakeBins();
    try {
      const runner = new AgentRunner(config(fx.root), () => {});
      runner.start(task(fx.root), "feat/0068", agent("claude code"), { cwd: fx.wt });
      await waitFor(() => !runner.isRunning("0068"), "agent turn exit");

      const mainText = readFileSync(join(fx.root, "work", "0068-tunnel.md"), "utf8");
      expect(mainText).toContain("status: ready");
    } finally {
      process.env.PATH = bins.restorePath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      fx.clean();
      bins.clean();
    }
  });
});
