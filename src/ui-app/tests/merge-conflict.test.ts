import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { computeMergeConflict, conflictPatchForContent } from "../../server/merge-conflict.js";

describe("conflictPatchForContent", () => {
  it("renders main's side as removals and the branch's side as additions", () => {
    const merged = [
      "a",
      "b",
      "c",
      "d",
      "<<<<<<< HEAD",
      "main line",
      "=======",
      "branch line",
      ">>>>>>> feature",
      "e",
      "",
    ].join("\n");
    expect(conflictPatchForContent("src/x.ts", merged)).toBe(
      [
        "diff --git a/src/x.ts b/src/x.ts",
        "--- a/src/x.ts",
        "+++ b/src/x.ts",
        "@@ conflict 1 of 1 · line 5 · main (−) vs branch (+) @@",
        " b",
        " c",
        " d",
        "-main line",
        "+branch line",
        " e",
        "",
      ].join("\n"),
    );
  });

  it("drops the diff3 base section and numbers several conflicts", () => {
    const merged = [
      "<<<<<<< HEAD",
      "m1",
      "||||||| base",
      "old",
      "=======",
      "t1",
      ">>>>>>> feature",
      "mid",
      "<<<<<<< HEAD",
      "m2",
      "=======",
      "t2",
      ">>>>>>> feature",
    ].join("\n");
    const patch = conflictPatchForContent("f.txt", merged);
    expect(patch).not.toContain("old");
    expect(patch).toContain("conflict 1 of 2");
    expect(patch).toContain("conflict 2 of 2");
    expect(patch).toContain("-m1\n+t1\n mid\n");
  });

  it("explains a file with no inline markers", () => {
    expect(conflictPatchForContent("img.png", "plain")).toContain("no inline markers");
  });
});

describe("computeMergeConflict", () => {
  let repo: string;
  const sh = (cmd: string): void => {
    execSync(cmd, { cwd: repo, stdio: "ignore" });
  };

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "repoos-conflict-"));
    sh("git init -q -b main");
    sh('git config user.email "t@example.com"');
    sh('git config user.name "T"');
    mkdirSync(join(repo, "work"));
    writeFileSync(join(repo, "a.txt"), "one\ntwo\nthree\n");
    writeFileSync(join(repo, "work", "0001.md"), "base\n");
    sh("git add -A && git commit -q -m init");
    sh("git checkout -q -b feature");
    writeFileSync(join(repo, "a.txt"), "one\nbranch two\nthree\n");
    writeFileSync(join(repo, "work", "0001.md"), "branch\n");
    sh("git commit -qam branch");
    sh("git checkout -q main");
  });

  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  it("reports a clean merge as not conflicted", async () => {
    const r = await computeMergeConflict(repo, "feature");
    expect(r).toMatchObject({ ok: true, conflicted: false, files: [], patch: "" });
  });

  it("describes the conflicted file and skips ignored task bookkeeping", async () => {
    writeFileSync(join(repo, "a.txt"), "one\nmain two\nthree\n");
    writeFileSync(join(repo, "work", "0001.md"), "main\n");
    sh("git commit -qam main-change");
    const r = await computeMergeConflict(repo, "feature", { ignorePrefixes: ["work/"] });
    expect(r.ok).toBe(true);
    expect(r.conflicted).toBe(true);
    expect(r.files).toEqual(["a.txt"]);
    expect(r.patch).toContain("-main two\n+branch two\n");
    expect(r.patch).not.toContain("work/0001.md");
  });

  it("lists the closing task's own file when it is NOT auto-resolved (#0754)", async () => {
    // A task-file-only conflict: with the close-out's auto-resolve opts the tab
    // excludes it (it will not be refused on); with no opts, the tab lists it so
    // its file list matches a refusal that names it.
    writeFileSync(join(repo, "work", "0001.md"), "branch\n");
    sh("git commit -qam branch-task");
    sh("git checkout -q main");
    writeFileSync(join(repo, "work", "0001.md"), "main\n");
    sh("git commit -qam main-task");

    // Auto-resolved (the close-out's own opts): not a real conflict.
    const autoResolved = await computeMergeConflict(repo, "feature", {
      autoResolve: ["work/0001.md"],
      autoResolveOurs: ["work/", "inputs/", "stories/"],
    });
    expect(autoResolved.conflicted).toBe(false);
    expect(autoResolved.files).toEqual([]);

    // Not auto-resolved: the tab lists the task file, matching the refusal.
    const shown = await computeMergeConflict(repo, "feature", {
      autoResolve: [],
      autoResolveOurs: [],
    });
    expect(shown.conflicted).toBe(true);
    expect(shown.files).toContain("work/0001.md");
    expect(shown.patch).toContain("-main\n+branch\n");
  });

  it("still hides OTHER tasks' bookkeeping files under the keep-ours prefixes", async () => {
    // On main: an unrelated task file and a.txt both change. On feature: the
    // same unrelated task file changes (routine bookkeeping) and a.txt is left.
    writeFileSync(join(repo, "work", "0002-other.md"), "base\n");
    sh("git add -A && git commit -qam add-other-base");
    sh("git checkout -q feature");
    writeFileSync(join(repo, "work", "0002-other.md"), "branch other\n");
    sh("git add -A && git commit -qam branch-other");
    sh("git checkout -q main");
    writeFileSync(join(repo, "work", "0002-other.md"), "main other\n");
    writeFileSync(join(repo, "a.txt"), "one\nmain two\nthree\n");
    sh("git add -A && git commit -qam main-change");

    const r = await computeMergeConflict(repo, "feature", {
      autoResolve: ["work/0001.md"],
      autoResolveOurs: ["work/", "inputs/", "stories/"],
    });
    // The unrelated work file is bookkeeping the close-out keeps main's copy of,
    // so it is not the tab's concern; a.txt is a real conflict.
    expect(r.files).toEqual(["a.txt"]);
  });

  it("leaves the checkout untouched", async () => {
    writeFileSync(join(repo, "a.txt"), "one\nmain two\nthree\n");
    sh("git commit -qam main-change");
    await computeMergeConflict(repo, "feature");
    expect(execSync("git status --porcelain", { cwd: repo }).toString()).toBe("");
  });

  it("surfaces a git failure instead of throwing", async () => {
    const r = await computeMergeConflict(repo, "no-such-branch");
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });
});
