import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canaryRelPath } from "./canary.js";
import { ensureCanaryReadyForTask } from "./canary-repo.js";
import type { RepoOSConfig } from "./types.js";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function makeRepo(): { root: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "canary-repo-"));
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);
  return {
    root,
    clean: () => rmSync(root, { recursive: true, force: true }),
  };
}

function config(root: string, cacheDir = ".repoos"): RepoOSConfig {
  return { root, cacheDir, workDir: "work", docsDir: "docs" } as RepoOSConfig;
}

describe("ensureCanaryReadyForTask", () => {
  it("rewrites legacy .repoos/ ignore and commits a trackable canary.txt", () => {
    const { root, clean } = makeRepo();
    try {
      writeFileSync(
        join(root, ".gitignore"),
        "# RepoOS derived index cache\n.repoos/\n# Local secrets\n.env\n",
      );
      git(root, ["add", ".gitignore"]);
      git(root, ["commit", "-m", "gitignore"]);

      expect(ensureCanaryReadyForTask(config(root))).toBe(true);

      const rel = canaryRelPath();
      expect(existsSync(join(root, rel))).toBe(true);
      expect(git(root, ["ls-files", "--", rel])).toBe(rel);

      const gi = readFileSync(join(root, ".gitignore"), "utf8");
      expect(gi).toContain(".repoos/*");
      expect(gi).toContain("!.repoos/canary.txt");
      expect(gi).not.toMatch(/^\.repoos\/$/m);

      expect(git(root, ["status", "--porcelain"]).trim()).toBe("");
    } finally {
      clean();
    }
  });

  it("fixes a broken append-only negation left with a directory ignore", () => {
    const { root, clean } = makeRepo();
    try {
      writeFileSync(
        join(root, ".gitignore"),
        ".repoos/\n# RepoOS canary flow-test counter (tracked)\n!.repoos/canary.txt\n",
      );
      mkdirSync(join(root, ".repoos"), { recursive: true });
      writeFileSync(join(root, canaryRelPath()), "0");

      expect(ensureCanaryReadyForTask(config(root))).toBe(true);
      expect(git(root, ["ls-files", "--", canaryRelPath()]).trim()).toBe(canaryRelPath());
    } finally {
      clean();
    }
  });

  it("refuses when the root checkout is not on the default branch", () => {
    const { root, clean } = makeRepo();
    try {
      git(root, ["checkout", "-b", "feature"]);
      const failures: string[] = [];
      expect(ensureCanaryReadyForTask(config(root), (d) => failures.push(d))).toBe(false);
      expect(failures.some((m) => m.includes("not") && m.includes("main"))).toBe(true);
    } finally {
      clean();
    }
  });
});
