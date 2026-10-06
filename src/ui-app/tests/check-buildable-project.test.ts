import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  branchAddsBuildableProjectMarker,
  diffTouchesBuildableProjectMarker,
  pathEndsWithBuildableMarker,
} from "../../core/check-buildable-project.js";
import { addedPathsVsBase } from "../../core/git.js";

const cleanups: string[] = [];

function git(root: string, args: string[]): void {
  execFileSync("git", ["-C", root, ...args], {
    stdio: "pipe",
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@e",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@e",
    },
  });
}

function planlessRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-buildable-"));
  cleanups.push(root);
  writeFileSync(join(root, "README.md"), "# plan\n");
  writeFileSync(join(root, "repoos.toml"), 'workDir = "work"\n');
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["add", "-A"]);
  git(root, ["commit", "-qm", "init"]);
  git(root, ["checkout", "-q", "-b", "feat/project"]);
  return root;
}

afterEach(() => {
  for (const dir of cleanups.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("check-buildable-project markers (#0697)", () => {
  it("matches nested package.json paths", () => {
    expect(pathEndsWithBuildableMarker("apps/web/package.json")).toBe(true);
    expect(pathEndsWithBuildableMarker("README.md")).toBe(false);
  });

  it("detects when a branch adds package.json on a planless repo", () => {
    const root = planlessRepo();
    writeFileSync(join(root, "package.json"), '{"name":"app"}\n');
    git(root, ["add", "package.json"]);
    git(root, ["commit", "-qm", "add pkg"]);
    expect(branchAddsBuildableProjectMarker(root, "main")).toBe(true);
    const added = addedPathsVsBase(root, "main");
    expect(added).toContain("package.json");
    expect(diffTouchesBuildableProjectMarker(added ?? [])).toBe(true);
  });

  it("does not treat docs-only changes as adding a project", () => {
    const root = planlessRepo();
    writeFileSync(join(root, "notes.md"), "plan\n");
    git(root, ["add", "notes.md"]);
    git(root, ["commit", "-qm", "docs"]);
    expect(branchAddsBuildableProjectMarker(root, "main")).toBe(false);
  });
});
