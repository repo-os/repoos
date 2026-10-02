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
