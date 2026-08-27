/**
 * The close-out gate must not publish a task whose merge produced no net
 * change to main while the branch still carries unmerged work — the shape
 * that silently shipped nothing for #0306/#0307/#0309/#0312 (the check then
 * validates bare main and trivially passes).
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectDroppedMerge } from "../../server/integration-orchestrator.js";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function makeRepo(): { root: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-dropped-merge-"));
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  writeFileSync(join(root, "README.md"), "hi\n");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "init"]);
  return { root, clean: () => rmSync(root, { recursive: true, force: true }) };
}

describe("detectDroppedMerge", () => {
  it("flags a no-op merge when the branch still carries unmerged work", async () => {
    const { root, clean } = makeRepo();
    try {
      const base = git(root, ["rev-parse", "main"]);
      git(root, ["checkout", "-q", "-b", "feat/x"]);
      writeFileSync(join(root, "feature.ts"), "export const shipped = true;\n");
      git(root, ["add", "-A"]);
      git(root, ["commit", "-q", "-m", "feat: real work"]);
      git(root, ["checkout", "-q", "main"]);

      // Simulate a merge whose result is still exactly base main (the bug).
      const reason = await detectDroppedMerge(root, "main", "feat/x", base, base);
      expect(reason).toMatch(/still carries commits main does not have/i);
      expect(reason).toMatch(/feat\/x/);
    } finally {
      clean();
    }
  });

  it("allows a no-op merge when the branch is already fully in main", async () => {
    const { root, clean } = makeRepo();
    try {
      git(root, ["checkout", "-q", "-b", "feat/x"]);
      writeFileSync(join(root, "feature.ts"), "export const shipped = true;\n");
      git(root, ["add", "-A"]);
      git(root, ["commit", "-q", "-m", "feat: real work"]);
      git(root, ["checkout", "-q", "main"]);
      git(root, ["merge", "-q", "--ff-only", "feat/x"]);
      const head = git(root, ["rev-parse", "main"]);

      // Merging feat/x again is legitimately a no-op — nothing to flag.
      expect(await detectDroppedMerge(root, "main", "feat/x", head, head)).toBeNull();
    } finally {
      clean();
    }
  });

  it("is a fast no-op when the merge did change main", async () => {
    const { root, clean } = makeRepo();
    try {
      const base = git(root, ["rev-parse", "main"]);
      // postMergeHead differs from base → not the dropped-merge shape at all.
      expect(await detectDroppedMerge(root, "main", "feat/x", "deadbeef", base)).toBeNull();
    } finally {
      clean();
    }
  });
});
