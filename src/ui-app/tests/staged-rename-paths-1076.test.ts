/**
 * #1076 review 6: pathspec commits built from name lists must see BOTH halves
 * of a staged rename. With rename detection a list reports only the new path,
 * so `git commit -- <new>` left the old path's deletion staged.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { branchChangesSinceBase, changedPathsVsBase } from "../../core/git";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

describe("name lists include both halves of a staged rename (#1076)", () => {
  it("lists the old and the new path", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-1076-rename-"));
    git(root, ["init", "-q", "-b", "main"]);
    git(root, ["config", "user.email", "t@example.com"]);
    git(root, ["config", "user.name", "t"]);
    writeFileSync(join(root, "a.txt"), "same content\n".repeat(20));
    git(root, ["add", "."]);
    git(root, ["commit", "-qm", "base"]);
    git(root, ["mv", "a.txt", "b.txt"]);

    const changed = changedPathsVsBase(root, "main") ?? [];
    expect(changed).toContain("a.txt");
    expect(changed).toContain("b.txt");
    expect(branchChangesSinceBase(root, "main").paths).toEqual(
      expect.arrayContaining(["a.txt", "b.txt"]),
    );
  });
});
