import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { isEvidenceCurrent } from "../../server/evidence-current.js";
import type { RepoOSConfig } from "../../core/types.js";

describe("isEvidenceCurrent", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  function repo() {
    const root = mkdtempSync(join(tmpdir(), "repoos-evidence-current-"));
    roots.push(root);
    const git = (...args: string[]) =>
      execFileSync("git", ["-C", root, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    const write = (path: string, value = `${path}\n`) => {
      const file = join(root, path);
      mkdirSync(join(file, ".."), { recursive: true });
      writeFileSync(file, value);
    };
    git("init", "-b", "main");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");
    write("README.md");
    git("add", "README.md");
    git("commit", "-q", "-m", "base");
    const base = git("rev-parse", "HEAD");
    const commit = (paths: string[], message = "change") => {
      for (const path of paths) write(path);
      git("add", "--", ...paths);
      git("commit", "-q", "-m", message);
      return git("rev-parse", "HEAD");
    };
    return { root, base, commit, git, write };
  }

  it("treats bookkeeping-only changes and merge commits as current", async () => {
    const r = repo();
    const head = r.commit(["work/0861.md", "work/0862.md"]);
    expect(await isEvidenceCurrent(r.root, r.base, head, {} as RepoOSConfig)).toBe(true);

    // A main-sync merge that adds only another task file has the same semantic
    // diff from the captured commit and therefore remains current.
    r.git("checkout", "-q", "-b", "other");
    r.commit(["work/0999.md"]);
    const other = r.git("rev-parse", "HEAD");
    r.git("checkout", "-q", "main");
    r.commit(["work/1000.md"]);
    r.git("merge", "--no-ff", "-q", "other", "-m", "sync");
    const merged = r.git("rev-parse", "HEAD");
    expect(await isEvidenceCurrent(r.root, head, merged, {} as RepoOSConfig)).toBe(true);
    expect(other).not.toBe(merged);
  });

  it("treats source and mixed changes as stale", async () => {
    const r = repo();
    const bookkeeping = r.commit(["work/0861.md"]);
    const source = r.commit(["src/feature.ts"]);
    expect(await isEvidenceCurrent(r.root, r.base, source, {} as RepoOSConfig)).toBe(false);
    expect(await isEvidenceCurrent(r.root, bookkeeping, source, {} as RepoOSConfig)).toBe(false);
  });

  it("fails closed for unknown commits and honors configured repoos namespace paths", async () => {
    const r = repo();
    const config = {
      workDir: "repoos/tasks",
      inputsDir: "repoos/inbox",
      storiesDir: "repoos/stories",
      remindersDir: "repoos/reminders",
      schedulesDir: "repoos/schedules",
    } as RepoOSConfig;
    const head = r.commit([
      "repoos/tasks/0861.md",
      "repoos/inbox/.attachments/a.png",
      "repoos/stories/a.md",
      "repoos/reminders/a.md",
      "repoos/schedules/a.md",
      ".repoos/cache.json",
    ]);
    expect(await isEvidenceCurrent(r.root, r.base, head, config)).toBe(true);
    expect(await isEvidenceCurrent(r.root, "not-a-commit", head, config)).toBe(false);
  });
});
