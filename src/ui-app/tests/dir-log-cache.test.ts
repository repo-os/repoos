/**
 * lastCommitsForDir caches the per-file last-commit map against HEAD and only
 * walks new commits afterwards (2026-10-25 hotfix). A full `git log --name-only
 * -- work` over 20k+ bookkeeping commits took longer than git()'s 4 s timeout, so
 * every index refresh burned a core for 4 s and returned nothing.
 */
import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmFixture } from "./helpers";
import { lastCommitsForDir, lastCommitsForDirAsync } from "../../core/git";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function commit(root: string, file: string, body: string, message: string): void {
  mkdirSync(join(root, "work"), { recursive: true });
  writeFileSync(join(root, file), body);
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", message]);
}

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-dirlog-"));
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  return root;
}

describe("lastCommitsForDir cache", () => {
  const roots: string[] = [];
  afterEach(() => {
    while (roots.length) rmFixture(roots.pop()!);
  });

  it("returns the last commit per file and serves repeats from the cache", () => {
    const root = makeRepo();
    roots.push(root);
    commit(root, "work/a.md", "a1", "one");
    commit(root, "work/b.md", "b1", "two");
    const first = lastCommitsForDir(root, "work");
    expect(first.get("work/a.md")?.subject).toBe("one");
    expect(first.get("work/b.md")?.subject).toBe("two");
    expect(git(root, ["status", "--porcelain"])).toBe("");
    const second = lastCommitsForDir(root, "work");
    expect([...second.entries()]).toEqual([...first.entries()]);
    // a caller mutating its copy must not corrupt the cache
    second.clear();
    expect(lastCommitsForDir(root, "work").size).toBe(2);
  });

  it("picks up only the newer commits after HEAD moves forward", async () => {
    const root = makeRepo();
    roots.push(root);
    commit(root, "work/a.md", "a1", "one");
    commit(root, "work/b.md", "b1", "two");
    lastCommitsForDir(root, "work");
    commit(root, "work/a.md", "a2", "three");
    commit(root, "work/c.md", "c1", "four");
    const sync = lastCommitsForDir(root, "work");
    expect(sync.get("work/a.md")?.subject).toBe("three");
    expect(sync.get("work/b.md")?.subject).toBe("two");
    expect(sync.get("work/c.md")?.subject).toBe("four");
    const viaAsync = await lastCommitsForDirAsync(root, "work");
    expect([...viaAsync.entries()]).toEqual([...sync.entries()]);
  });

  it("falls back to a full walk when HEAD moves backwards (reset)", () => {
    const root = makeRepo();
    roots.push(root);
    commit(root, "work/a.md", "a1", "one");
    commit(root, "work/a.md", "a2", "two");
    expect(lastCommitsForDir(root, "work").get("work/a.md")?.subject).toBe("two");
    git(root, ["reset", "-q", "--hard", "HEAD~1"]);
    expect(lastCommitsForDir(root, "work").get("work/a.md")?.subject).toBe("one");
  });

  it("returns an empty map for a repo with no commits and for a missing dir", async () => {
    const root = makeRepo();
    roots.push(root);
    expect(lastCommitsForDir(root, "work").size).toBe(0);
    expect((await lastCommitsForDirAsync(root, "work")).size).toBe(0);
    commit(root, "README.md", "x", "init");
    expect(lastCommitsForDir(root, "nope").size).toBe(0);
  });

  it("shares one walk between simultaneous async callers", async () => {
    const root = makeRepo();
    roots.push(root);
    commit(root, "work/a.md", "a1", "one");
    const [x, y, z] = await Promise.all([
      lastCommitsForDirAsync(root, "work"),
      lastCommitsForDirAsync(root, "work"),
      lastCommitsForDirAsync(root, "work"),
    ]);
    expect(x.get("work/a.md")?.subject).toBe("one");
    expect(y).not.toBe(x);
    expect([...z.entries()]).toEqual([...x.entries()]);
  });
});
