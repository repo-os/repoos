/**
 * The `.githooks/pre-commit` guard for direct commits to main. A hand commit
 * straight to main skips close-out's gate; on 2026-09-18 one left
 * src/ui-app/src/style.css failing `oxfmt --check`, and every close-out after
 * it failed (#0423, #0425). The hook is scoped so RepoOS's own commits (task
 * files, task branches, merges) are never blocked.
 */
import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const env = {
  ...process.env,
  PATH: `${join(repoRoot, "node_modules", ".bin")}:${process.env.PATH ?? ""}`,
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@t",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@t",
};
const dirs: string[] = [];

function git(cwd: string, ...args: string[]) {
  return spawnSync("git", args, { cwd, env, encoding: "utf8" });
}

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), "repoos-hook-"));
  dirs.push(dir);
  git(dir, "init", "-q", "-b", "main");
  cpSync(join(repoRoot, ".githooks"), join(dir, ".githooks"), { recursive: true });
  git(dir, "config", "core.hooksPath", ".githooks");
  writeFileSync(join(dir, "README.md"), "seed\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "--no-verify", "-m", "seed");
  return dir;
}

function commitFile(dir: string, path: string, content: string) {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), content);
  git(dir, "add", path);
  return git(dir, "commit", "-q", "-m", `add ${path}`);
}

const BAD_CSS = "a {\n  color: red;\n}\n\n\nb {\n  color: blue;\n}\n";

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe(".githooks/pre-commit", () => {
  it("blocks a badly formatted source file committed straight to main", () => {
    const res = commitFile(repo(), "src/style.css", BAD_CSS);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("formatting issues in staged files on main");
  });

  it("allows the same file on a task branch (close-out gates those)", () => {
    const dir = repo();
    git(dir, "checkout", "-q", "-b", "feat/x");
    expect(commitFile(dir, "src/style.css", BAD_CSS).status).toBe(0);
  });

  it("never blocks task-file bookkeeping commits on main", () => {
    expect(
      commitFile(repo(), "work/0001-task.md", "---\nid: '0001'\n---\n\n\n\nbody\n").status,
    ).toBe(0);
  });

  it("allows well-formatted source on main", () => {
    expect(commitFile(repo(), "src/ok.ts", "export const x = 1;\n").status).toBe(0);
  });
});
