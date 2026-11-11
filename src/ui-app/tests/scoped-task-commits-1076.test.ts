/**
 * #1076: every commit the server makes in a task worktree (or a close-out
 * candidate) is pathspec-scoped, so a sibling task's `work/<other-id>-*.md`
 * staged in the index never rides the branch or publishes to main.
 *
 * Covers the four commit boundaries that can run with a foreign file staged:
 * the implement commit, the hotfix commit, the union-merge commit and the
 * close-out "keep main's copy" commit.
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import type { RepoOSConfig } from "../../core/types";
import { parseTask } from "../../core/task";
import { guardReviewTransition } from "../../server/review-guard";
import { CloseOutOrchestrator, resetForeignWorkFiles } from "../../server/integration-orchestrator";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function changedInHead(cwd: string): string[] {
  return git(cwd, ["show", "--name-only", "--format=", "HEAD"]).split("\n").filter(Boolean);
}

const cfg = (root: string): RepoOSConfig => ({
  root,
  workDir: "work",
  docsDir: "docs",
  skillsDir: "skills",
  taskExtensions: [".md"],
  defaultStatus: "inbox",
  defaultAssignee: "unassigned",
  cacheDir: ".repoos",
});

const SIBLING = "work/0299-sibling.md";
const siblingText = '---\nid: "0299"\n---\nstale board write\n';

/** A main repo with task 0210 committed and a `feat/x` task worktree. */
function makeTaskRepo() {
  const root = mkdtempSync(join(tmpdir(), "repoos-1076-commit-"));
  const wt = `${root}-wt`;
  const taskPath = join(root, "work", "0210-own.md");
  mkdirSync(join(root, "work"), { recursive: true });
  writeFileSync(
    taskPath,
    '---\nid: "0210"\ntitle: Scoped commit fixture\ntype: feature\nstatus: active\npriority: p1\narea: server\nassigned_to: ai\nbranch: feat/x\n---\nBody\n',
  );
  writeFileSync(join(root, "source.txt"), "base\n");
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "initial"]);
  git(root, ["branch", "feat/x"]);
  git(root, ["worktree", "add", "-q", wt, "feat/x"]);
  const task = parseTask({
    content: readFileSync(taskPath, "utf8"),
    absPath: taskPath,
    root,
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
  });
  return {
    root,
    wt,
    task,
    clean: () => {
      rmSync(root, { recursive: true, force: true });
      rmSync(wt, { recursive: true, force: true });
    },
  };
}

describe.each([
  ["implement", false],
  ["hotfix", true],
])("guardReviewTransition %s commit (#1076)", (_label, hotfix) => {
  it("never commits another task's bookkeeping staged in the index", async () => {
    const repo = makeTaskRepo();
    try {
      writeFileSync(join(repo.wt, "source.txt"), "implemented\n");
      writeFileSync(join(repo.wt, SIBLING), siblingText);
      // A concurrent board write (or a stray `git add`) staged the sibling.
      git(repo.wt, ["add", "--", SIBLING]);

      const res = await guardReviewTransition(cfg(repo.root), { ...repo.task, hotfix });

      expect(res.ok).toBe(true);
      expect(changedInHead(repo.wt)).toContain("source.txt");
      expect(changedInHead(repo.wt)).not.toContain(SIBLING);
      // Unstaged, not deleted: the sibling's working-tree copy is left alone.
      expect(readFileSync(join(repo.wt, SIBLING), "utf8")).toBe(siblingText);
      expect(git(repo.wt, ["diff", "--cached", "--name-only"])).toBe("");
    } finally {
      repo.clean();
    }
  });
});

describe("CloseOutOrchestrator union-merge commit (#1076)", () => {
  it("unstages a sibling staged before the merge commit so it never rides it", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-1076-union-"));
    const cand = `${root}-cand`;
    try {
      git(root, ["init", "-q", "-b", "main"]);
      git(root, ["config", "user.email", "t@example.com"]);
      git(root, ["config", "user.name", "Test"]);
      writeFileSync(join(root, "src.txt"), "line1\n");
      git(root, ["add", "-A"]);
      git(root, ["commit", "-q", "-m", "init"]);
      // Both sides insert at the same spot: an insertion-only conflict, the only
      // shape the union resolver accepts.
      git(root, ["checkout", "-q", "-b", "feat/x"]);
      writeFileSync(join(root, "src.txt"), "line1\nFEAT\n");
      git(root, ["commit", "-qam", "feat"]);
      git(root, ["checkout", "-q", "main"]);
      writeFileSync(join(root, "src.txt"), "line1\nMAIN\n");
      git(root, ["commit", "-qam", "main moves"]);
      git(root, ["worktree", "add", "-q", "-b", "repoos/integrate/0001", cand, "main"]);

      // The merge is already conflicted when a concurrent board write stages a
      // sibling. git refuses a fresh merge over a dirty index, so the staged
      // sibling is only reachable this way: the union step re-runs `merge`
      // (which fails harmlessly, the merge is in progress) and still resolves
      // the unmerged path, then commits with the sibling in the index.
      expect(() => git(cand, ["merge", "--no-commit", "--no-ff", "feat/x"])).toThrow();
      mkdirSync(join(cand, "work"), { recursive: true });
      writeFileSync(join(cand, SIBLING), siblingText);
      git(cand, ["add", "--", SIBLING]);

      const orch = Object.create(CloseOutOrchestrator.prototype) as {
        config: RepoOSConfig;
        applyUnionResolution: (
          taskId: string,
          wtPath: string,
          featureBranch: string,
          conflictPaths: string[],
        ) => Promise<{ ok: boolean }>;
      };
      orch.config = cfg(root);

      const res = await orch.applyUnionResolution("0001", cand, "feat/x", ["src.txt"]);

      expect(res.ok).toBe(true);
      const committed = git(cand, ["diff", "--name-only", "main", "HEAD"])
        .split("\n")
        .filter(Boolean);
      expect(committed).toContain("src.txt");
      expect(committed).not.toContain(SIBLING);
      expect(readFileSync(join(cand, "src.txt"), "utf8")).toContain("FEAT");
      expect(readFileSync(join(cand, "src.txt"), "utf8")).toContain("MAIN");
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(cand, { recursive: true, force: true });
    }
  });
});

describe("resetForeignWorkFiles keep-main commit (#1076)", () => {
  it("commits only the restored sibling, leaving an unrelated staged file out", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-1076-keep-"));
    const cand = `${root}-cand`;
    try {
      git(root, ["init", "-q", "-b", "main"]);
      git(root, ["config", "user.email", "t@example.com"]);
      git(root, ["config", "user.name", "Test"]);
      mkdirSync(join(root, "work"), { recursive: true });
      writeFileSync(join(root, "work", "0002-other.md"), '---\nid: "0002"\n---\nMAIN\n');
      writeFileSync(join(root, "src.txt"), "base\n");
      git(root, ["add", "-A"]);
      git(root, ["commit", "-q", "-m", "init"]);
      const baseSha = git(root, ["rev-parse", "HEAD"]);
      git(root, ["checkout", "-q", "-b", "feat/x"]);
      writeFileSync(join(root, "work", "0002-other.md"), '---\nid: "0002"\n---\nSTALE\n');
      git(root, ["commit", "-qam", "feat: stray sibling drift"]);
      git(root, ["checkout", "-q", "main"]);
      git(root, ["worktree", "add", "-q", "-b", "repoos/integrate/0001", cand, "main"]);
      git(cand, ["merge", "--no-edit", "feat/x"]);

      // An unrelated file the candidate's index holds when the restore runs.
      writeFileSync(join(cand, "unrelated.txt"), "not bookkeeping\n");
      git(cand, ["add", "--", "unrelated.txt"]);

      const reset = await resetForeignWorkFiles({
        candidateWtPath: cand,
        baseMainSha: baseSha,
        dirs: {
          workDir: "work",
          inputsDir: "inputs",
          storiesDir: "stories",
          remindersDir: "reminders",
          schedulesDir: "schedules",
        },
        ownWorkFile: "work/0001-own.md",
      });

      expect(reset).toEqual(["work/0002-other.md"]);
      expect(git(cand, ["diff", "--name-only", baseSha, "HEAD"])).not.toContain(
        "work/0002-other.md",
      );
      expect(changedInHead(cand)).not.toContain("unrelated.txt");
      // The unrelated file stays staged for whoever owns it, not swept in.
      expect(git(cand, ["diff", "--cached", "--name-only"])).toBe("unrelated.txt");
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(cand, { recursive: true, force: true });
    }
  });
});
