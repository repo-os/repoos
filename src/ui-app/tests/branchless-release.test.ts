/**
 * Branch-less release path: a task fixed by direct commit on main (a
 * hotfix — see #0212, not yet a first-class flow) has no branch to merge, so
 * the normal /done pipeline dead-ends on "no branch to merge". This is the
 * separate path that verifies main is currently green and releases directly.
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTask } from "../../core/task.js";
import {
  releaseBranchless,
  isBranchlessReleaseEligible,
  type CheckResult,
} from "../../server/branchless-release.js";
import type { RepoOSConfig, Task } from "../../core/types.js";

function git(root: string, args: string[]): void {
  execFileSync("git", args, { cwd: root, stdio: "ignore" });
}

function makeRepo(): { root: string; config: RepoOSConfig; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-branchless-"));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  mkdirSync(join(root, "work"));
  writeFileSync(
    join(root, "work", "T1-hotfix.md"),
    `---\nid: "T1"\ntitle: Hotfix\ntype: bug\nstatus: ready\npriority: p1\narea: core\nassigned_to: ""\nbranch: ""\ncreated_at: "2026-01-01T00:00:00Z"\nupdated_at: "2026-01-01T00:00:00Z"\n---\n## Problem\n\ntest\n`,
  );
  git(root, ["add", "-A"]);
  git(root, ["commit", "-m", "init"]);
  return {
    root,
    config: { root, workDir: "work", defaultStatus: "inbox", defaultAssignee: "unassigned" } as RepoOSConfig,
    clean: () => rmSync(root, { recursive: true, force: true }),
  };
}

function readTask(root: string, config: RepoOSConfig): Task {
  const absPath = join(root, "work", "T1-hotfix.md");
  return parseTask({
    content: readFileSync(absPath, "utf8"),
    absPath,
    root,
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
  });
}

describe("isBranchlessReleaseEligible", () => {
  it("is eligible: no branch, not done, not review", () => {
    expect(isBranchlessReleaseEligible({ branch: "", status: "ready" } as Task)).toBe(true);
    expect(isBranchlessReleaseEligible({ branch: undefined, status: "active" } as unknown as Task)).toBe(true);
    expect(isBranchlessReleaseEligible({ branch: "", status: "inbox" } as Task)).toBe(true);
  });

  it("is not eligible with a branch — that's the normal merge path's job", () => {
    expect(isBranchlessReleaseEligible({ branch: "feat/x", status: "ready" } as Task)).toBe(false);
  });

  it("is not eligible when already done — nothing to release twice", () => {
    expect(isBranchlessReleaseEligible({ branch: "", status: "done" } as Task)).toBe(false);
  });

  it("is not eligible when status is review — that shape shouldn't occur branch-less; defer to the merge path's own guard", () => {
    expect(isBranchlessReleaseEligible({ branch: "", status: "review" } as Task)).toBe(false);
  });
});

describe("releaseBranchless", () => {
  it("releases the task when the check passes", async () => {
    const { root, config, clean } = makeRepo();
    try {
      const task = readTask(root, config);
      const passingCheck = (): CheckResult => ({ ok: true });

      const result = await releaseBranchless(config, task, passingCheck);

      expect(result.ok).toBe(true);
      expect(result.task?.status).toBe("done");
      const body = readFileSync(join(root, "work", "T1-hotfix.md"), "utf8");
      expect(body).toMatch(/status: done/);
      expect(body).toMatch(/release:success/);
    } finally {
      clean();
    }
  });

  it("refuses to release when the check fails, and does not touch the task file", async () => {
    const { root, config, clean } = makeRepo();
    try {
      const task = readTask(root, config);
      const before = readFileSync(join(root, "work", "T1-hotfix.md"), "utf8");
      const failingCheck = (): CheckResult => ({ ok: false, output: "1 test failed: something broke" });

      const result = await releaseBranchless(config, task, failingCheck);

      expect(result.ok).toBe(false);
      expect(result.reason).toContain("cannot release a branch-less task until main is green");
      expect(result.reason).toContain("something broke");
      const after = readFileSync(join(root, "work", "T1-hotfix.md"), "utf8");
      expect(after).toBe(before); // untouched — no partial write
    } finally {
      clean();
    }
  });

  it("runs the check against the task's own repo root", async () => {
    const { root, config, clean } = makeRepo();
    try {
      const task = readTask(root, config);
      let seenRoot: string | null = null;
      const spy = (r: string): CheckResult => {
        seenRoot = r;
        return { ok: true };
      };

      await releaseBranchless(config, task, spy);
      expect(seenRoot).toBe(root);
    } finally {
      clean();
    }
  });
});
