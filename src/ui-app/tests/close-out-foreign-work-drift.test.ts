/**
 * The close-out must publish ONLY the closing task's own `work/*.md` file.
 *
 * A feature branch can carry stale edits to other tasks' files — a concurrent
 * board write, a `repoos` CLI call in the worktree, a partial merge. When main
 * has not touched those files since the merge-base, git merges them into the
 * candidate with no conflict, so the close-out's conflict-only `autoResolveOurs`
 * never fires and the stale version ships to main. Observed live: #0319's
 * close-out published #0202/#0275 frontmatter drift. `resetForeignWorkFiles`
 * closes that gap.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resetForeignWorkFiles } from "../../server/integration-orchestrator.js";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

/**
 * A repo with two task files on main and a feature branch that edited BOTH its
 * own file and the other one, then a candidate worktree with the branch merged
 * in cleanly (main never re-touched either file).
 */
function makeFixture(withStray = false): {
  root: string;
  candidate: string;
  baseSha: string;
  clean: () => void;
} {
  const root = mkdtempSync(join(tmpdir(), "repoos-foreign-drift-"));
  mkdirSync(join(root, "work"), { recursive: true });
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  writeFileSync(
    join(root, "work", "0001-own.md"),
    '---\nid: "0001"\nreview_passes: 1\n---\nown body\n',
  );
  writeFileSync(
    join(root, "work", "0002-other.md"),
    '---\nid: "0002"\nreview_passes: 3\n---\nother body — MAIN\n',
  );
  writeFileSync(join(root, "src.ts"), "export const v = 1;\n");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "init"]);
  const baseSha = git(root, ["rev-parse", "HEAD"]);

  // Feature branch edits its own task file (fine) AND the other one (drift).
  git(root, ["checkout", "-q", "-b", "feat/x"]);
  writeFileSync(join(root, "src.ts"), "export const v = 2;\n");
  writeFileSync(
    join(root, "work", "0001-own.md"),
    '---\nid: "0001"\nreview_passes: 2\n---\nown body edited\n',
  );
  writeFileSync(
    join(root, "work", "0002-other.md"),
    '---\nreview_passes: 99\nid: "0002"\n---\nother body — STALE DRIFT\n',
  );
  if (withStray) {
    writeFileSync(
      join(root, "work", "0003-stray.md"),
      '---\nid: "0003"\n---\nnot this task\'s to create\n',
    );
  }
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "feat(0001): work + drift"]);
  git(root, ["checkout", "-q", "main"]);

  // Candidate worktree = a fresh branch at main's tip (mirrors the real
  // `repoos/integrate/<id>` candidate), feature branch merged in cleanly.
  const candidate = `${root}-candidate`;
  git(root, ["worktree", "add", "-q", "-b", "repoos/integrate/0001", candidate, "main"]);
  const merge = git(candidate, ["merge", "--no-edit", "feat/x"]);
  expect(merge).not.toMatch(/conflict/i);

  return {
    root,
    candidate,
    baseSha,
    clean: () => {
      rmSync(root, { recursive: true, force: true });
      rmSync(candidate, { recursive: true, force: true });
    },
  };
}

describe("resetForeignWorkFiles (close-out drift guard)", () => {
  it("restores main's copy of another task's file but keeps the closing task's own edit", async () => {
    const fx = makeFixture();
    try {
      // Sanity: the clean merge carried the drift in.
      expect(readFileSync(join(fx.candidate, "work", "0002-other.md"), "utf8")).toContain(
        "STALE DRIFT",
      );

      const reset = await resetForeignWorkFiles({
        candidateWtPath: fx.candidate,
        baseMainSha: fx.baseSha,
        workDir: "work",
        ownWorkFile: "work/0001-own.md",
      });

      expect(reset).toEqual(["work/0002-other.md"]);
      // The other task's file is back to exactly main's bytes…
      expect(readFileSync(join(fx.candidate, "work", "0002-other.md"), "utf8")).toBe(
        '---\nid: "0002"\nreview_passes: 3\n---\nother body — MAIN\n',
      );
      // …and it is committed (not left dirty in the candidate).
      expect(git(fx.candidate, ["status", "--porcelain"])).toBe("");
      // The closing task's own file AND the source change survive.
      expect(readFileSync(join(fx.candidate, "work", "0001-own.md"), "utf8")).toContain(
        "own body edited",
      );
      expect(readFileSync(join(fx.candidate, "src.ts"), "utf8")).toContain("v = 2");
      // main's copy of 0002 is unchanged by the merge after the reset.
      expect(
        git(fx.candidate, ["diff", "--name-only", `${fx.baseSha}..HEAD`])
          .split("\n")
          .filter(Boolean),
      ).not.toContain("work/0002-other.md");
    } finally {
      fx.clean();
    }
  });

  it("removes a task file the branch newly added that isn't the closing task's", async () => {
    const fx = makeFixture(true);
    try {
      expect(readFileSync(join(fx.candidate, "work", "0003-stray.md"), "utf8")).toBeTruthy();

      const reset = await resetForeignWorkFiles({
        candidateWtPath: fx.candidate,
        baseMainSha: fx.baseSha,
        workDir: "work",
        ownWorkFile: "work/0001-own.md",
      });

      expect(reset.sort()).toEqual(["work/0002-other.md", "work/0003-stray.md"]);
      expect(git(fx.candidate, ["status", "--porcelain"])).toBe("");
      // The stray file is gone from the candidate tree entirely.
      const tracked = git(fx.candidate, ["ls-files", "work/"]).split("\n").filter(Boolean);
      expect(tracked).not.toContain("work/0003-stray.md");
      expect(tracked).toContain("work/0001-own.md");
    } finally {
      fx.clean();
    }
  });

  it("is a no-op (no extra commit) when nothing foreign changed", async () => {
    const fx = makeFixture();
    try {
      // First pass strips the drift and commits.
      await resetForeignWorkFiles({
        candidateWtPath: fx.candidate,
        baseMainSha: fx.baseSha,
        workDir: "work",
        ownWorkFile: "work/0001-own.md",
      });
      const head = git(fx.candidate, ["rev-parse", "HEAD"]);

      // Second pass: nothing foreign left → returns [] and adds no commit.
      const reset = await resetForeignWorkFiles({
        candidateWtPath: fx.candidate,
        baseMainSha: fx.baseSha,
        workDir: "work",
        ownWorkFile: "work/0001-own.md",
      });
      expect(reset).toEqual([]);
      expect(git(fx.candidate, ["rev-parse", "HEAD"])).toBe(head);
    } finally {
      fx.clean();
    }
  });
});
