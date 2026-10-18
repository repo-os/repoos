/**
 * Stray repoos.toml on task branches (#0827).
 */
import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig, Task } from "../../core/types.js";
import {
  guardStrayRepoosTomlOnTaskBranch,
  REPOOS_TOML_REL,
  STRAY_REPOOS_TOML_ON_BRANCH_PREFIX,
  taskDeclaresRepoosTomlWork,
} from "../../core/repoos-toml-branch-guard.js";
import { guardReviewTransition } from "../../server/review-guard.js";
import { commitWipCheckpointForRemoteGate } from "../../server/engineer-remote-self-check.js";

const cleanups: string[] = [];

afterEach(() => {
  for (const d of cleanups.splice(0)) rmSync(d, { recursive: true, force: true });
});

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function initRepo(root: string): void {
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "T"]);
  writeFileSync(join(root, REPOOS_TOML_REL), 'workDir = "work"\n');
  writeFileSync(join(root, "src.txt"), "base\n");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-qm", "init"]);
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "0827",
    title: "Unrelated feature",
    path: "work/0827-task.md",
    body: "",
    status: "active",
    branch: "feat/0827",
    ...overrides,
  } as Task;
}

describe("repoos.toml branch guard (#0827)", () => {
  it("fails when the branch diff touches repoos.toml and names the file", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-toml-guard-"));
    cleanups.push(root);
    initRepo(root);
    git(root, ["checkout", "-q", "-b", "feat/0827"]);
    writeFileSync(join(root, REPOOS_TOML_REL), 'workDir = "work"\nfoo = 1\n');
    git(root, ["add", REPOOS_TOML_REL]);
    git(root, ["commit", "-qm", "stray config"]);

    const res = await guardStrayRepoosTomlOnTaskBranch(root, "main", task());
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.detail).toContain(STRAY_REPOOS_TOML_ON_BRANCH_PREFIX);
    expect(res.detail).toContain(REPOOS_TOML_REL);
    expect(res.detail).toContain("git checkout main -- repoos.toml");
  });

  it("passes after reverting repoos.toml to main", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-toml-guard-revert-"));
    cleanups.push(root);
    initRepo(root);
    git(root, ["checkout", "-q", "-b", "feat/0827"]);
    writeFileSync(join(root, REPOOS_TOML_REL), 'workDir = "work"\nfoo = 1\n');
    git(root, ["add", REPOOS_TOML_REL]);
    git(root, ["commit", "-qm", "stray config"]);
    git(root, ["checkout", "main", "--", REPOOS_TOML_REL]);
    git(root, ["commit", "-qm", "revert toml"]);

    const res = await guardStrayRepoosTomlOnTaskBranch(root, "main", task());
    expect(res).toEqual({ ok: true });
  });

  it("exempts tasks whose title or paths declare repoos.toml work", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-toml-guard-exempt-"));
    cleanups.push(root);
    initRepo(root);
    git(root, ["checkout", "-q", "-b", "feat/config"]);
    writeFileSync(join(root, REPOOS_TOML_REL), 'workDir = "work"\nnewKey = true\n');
    git(root, ["add", REPOOS_TOML_REL]);
    git(root, ["commit", "-qm", "intentional"]);

    expect(
      await guardStrayRepoosTomlOnTaskBranch(
        root,
        "main",
        task({ title: "Expose newKey in repoos.toml", paths: [REPOOS_TOML_REL] }),
      ),
    ).toEqual({ ok: true });
    expect(taskDeclaresRepoosTomlWork({ title: "Config schema + Settings UI", paths: [] })).toBe(
      true,
    );
  });

  it("review implement commits skip repoos.toml unless the task declares that work", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-toml-guard-commit-"));
    const wt = `${root}-wt`;
    cleanups.push(root, wt);
    initRepo(root);
    mkdirSync(join(root, "work"), { recursive: true });
    writeFileSync(join(root, "work", "0827-task.md"), '---\nid: "0827"\n---\n');
    git(root, ["add", "work"]);
    git(root, ["commit", "-qm", "task file"]);
    git(root, ["branch", "feat/0827"]);
    execFileSync("git", ["worktree", "add", "-q", wt, "feat/0827"], { cwd: root });
    writeFileSync(join(wt, "impl.txt"), "work\n");
    writeFileSync(join(wt, REPOOS_TOML_REL), 'workDir = "work"\nstray = 1\n');

    const config = { root, workDir: "work", cacheDir: ".repoos" } as RepoOSConfig;
    const gate = await guardReviewTransition(config, task({ path: "work/0827-task.md" }));
    expect(gate.ok).toBe(true);
    const show = git(wt, ["show", "--name-only", "--format=", "HEAD"]);
    expect(show).toContain("impl.txt");
    expect(show).not.toContain(REPOOS_TOML_REL);
    expect(readFileSync(join(wt, REPOOS_TOML_REL), "utf8")).toContain("stray = 1");
  });

  it("WIP checkpoints in a task worktree do not commit repoos.toml", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-wip-toml-"));
    cleanups.push(root);
    initRepo(root);
    writeFileSync(join(root, "dirty.txt"), "edit\n");
    writeFileSync(join(root, REPOOS_TOML_REL), 'workDir = "work"\ndirty = 1\n');
    const err = await commitWipCheckpointForRemoteGate(
      root,
      { root, cacheDir: ".repoos", workDir: "work" } as RepoOSConfig,
      "0827",
    );
    expect(err).toBeNull();
    const names = git(root, ["show", "--name-only", "--format=", "HEAD"]);
    expect(names).toContain("dirty.txt");
    expect(names).not.toContain(REPOOS_TOML_REL);
    expect(readFileSync(join(root, REPOOS_TOML_REL), "utf8")).toContain("dirty = 1");
  });
});
