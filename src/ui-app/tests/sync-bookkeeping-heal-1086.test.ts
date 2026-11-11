/**
 * #1086: `healForeignBookkeepingAfterSync` — the same helper `syncTaskBranch` uses.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { branchChangedPaths, ensureWorktree, syncBranchWithMain } from "../../core/git.js";
import { healForeignBookkeepingAfterSync } from "../../server/sync-bookkeeping-heal.js";
import type { RepoOSConfig, Task } from "../../core/types.js";
import { rmFixture } from "./helpers";

const TASK_ID = "1086";
const OWN_FILE = `work/${TASK_ID}-sync-heal.md`;
const BRANCH = "feat/sync-heal-1086";
const TASK_A = "0003";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

describe("healForeignBookkeepingAfterSync (#1086)", () => {
  it("cleans sibling drift when sync aborts on conflict (production sync path)", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-sync-heal-1086-"));
    git(root, ["init", "-q", "-b", "main"]);
    git(root, ["config", "user.email", "t@example.com"]);
    git(root, ["config", "user.name", "Test"]);
    mkdirSync(join(root, "work"), { recursive: true });
    writeFileSync(join(root, OWN_FILE), `---\nid: "${TASK_ID}"\n---\n`);
    writeFileSync(join(root, "src.ts"), "base\n");
    git(root, ["add", "-A"]);
    git(root, ["commit", "-q", "-m", "init"]);

    const created = ensureWorktree(root, BRANCH);
    expect(created.ok).toBe(true);
    const wt = created.path;

    try {
      writeFileSync(join(wt, "src.ts"), "branch\n");
      git(wt, ["add", "src.ts"]);
      git(wt, ["commit", "-q", "-m", "own work"]);

      git(root, ["checkout", "-q", "main"]);
      mkdirSync(join(root, "work", "reports", TASK_A), { recursive: true });
      writeFileSync(join(root, "work", "reports", TASK_A, "summary.md"), "on main\n");
      git(root, ["add", "-A"]);
      git(root, ["commit", "-q", "-m", "main post-merge"]);

      mkdirSync(join(wt, "work", "reports", TASK_A), { recursive: true });
      writeFileSync(join(wt, "work", "reports", TASK_A, "summary.md"), "branch wrong\n");
      git(wt, ["add", `work/reports/${TASK_A}/summary.md`]);
      git(wt, ["commit", "-q", "-m", "stray sibling"]);

      const sync = await syncBranchWithMain(root, BRANCH);
      expect(sync.ok).toBe(false);

      const config: RepoOSConfig = {
        root,
        workDir: "work",
        docsDir: "docs",
        skillsDir: "skills",
        taskExtensions: [".md"],
        defaultStatus: "inbox",
        defaultAssignee: "unassigned",
        cacheDir: ".repoos",
        pressureGuard: { enabled: false },
        agents: [],
      } as RepoOSConfig;
      const task = {
        id: TASK_ID,
        branch: BRANCH,
        path: OWN_FILE,
      } as Task;

      await healForeignBookkeepingAfterSync(config, task, wt);
      expect(git(wt, ["status", "--porcelain"])).toBe("");
      const changed = await branchChangedPaths(root, BRANCH, "main");
      expect(changed).not.toContain(`work/reports/${TASK_A}/summary.md`);
    } finally {
      rmFixture(root);
    }
  });
});
