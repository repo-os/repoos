import { describe, expect, it, afterEach } from "vitest";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmFixture } from "./helpers.js";
import {
  ensureWorktree,
  gitCapture,
  setEnsureWorktreeTestSeam,
  type EnsureWorktreeTestSeam,
  type EnsureWorktreeResult,
  type GitRun,
} from "../../core/git.js";
import { worktreesDir } from "../../core/config.js";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function makeRepo(): { root: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-wt-0994-"));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);
  return { root, clean: () => rmFixture(root) };
}

function runEnsureWorktreeInSubprocess(
  root: string,
  branch: string,
): Promise<EnsureWorktreeResult> {
  const repoRoot = process.cwd();
  const script =
    `import { ensureWorktree } from ${JSON.stringify(join(repoRoot, "src/core/git.ts"))};` +
    `console.log(JSON.stringify(ensureWorktree(${JSON.stringify(root)}, ${JSON.stringify(branch)})));`;
  return new Promise((resolve, reject) => {
    const child = spawn("bun", ["-e", script], {
      cwd: repoRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(stderr || stdout || `exit ${code}`));
      else resolve(JSON.parse(stdout.trim()) as EnsureWorktreeResult);
    });
  });
}

afterEach(() => {
  setEnsureWorktreeTestSeam(null);
});

describe("ensureWorktree resilience (#0994)", () => {
  it("retries with plain worktree add after a timeout left the branch behind", () => {
    const { root, clean } = makeRepo();
    try {
      const branch = "feat/mid-checkout";
      const target = join(worktreesDir(root), branch);
      const addArgs: string[][] = [];
      let attempts = 0;
      const seam: EnsureWorktreeTestSeam = {
        gitCapture: (repo, args, timeoutMs): GitRun => {
          if (args[0] === "worktree" && args[1] === "add") {
            addArgs.push([...args]);
            attempts++;
            if (attempts === 1) {
              git(root, ["branch", branch]);
              mkdirSync(join(target, ".."), { recursive: true });
              return {
                status: null,
                stdout: "",
                stderr: "Updating files: 42%\n",
                timedOut: true,
              };
            }
            return gitCapture(repo, args, timeoutMs);
          }
          return gitCapture(repo, args, timeoutMs);
        },
      };
      setEnsureWorktreeTestSeam(seam);

      const res = ensureWorktree(root, branch);

      expect(res.ok).toBe(true);
      expect(res.created).toBe(true);
      expect(addArgs).toHaveLength(2);
      expect(addArgs[0]).toEqual(["worktree", "add", "-b", branch, target]);
      expect(addArgs[1]).toEqual(["worktree", "add", target, branch]);
      expect(git(root, ["worktree", "list", "--porcelain"])).toContain(res.path);
    } finally {
      clean();
    }
  });

  it("cleans up an empty orphan branch with no worktree after failure", () => {
    const { root, clean } = makeRepo();
    try {
      const branch = "feat/orphan";
      let addCalls = 0;
      setEnsureWorktreeTestSeam({
        gitCapture: (repo, args): GitRun => {
          if (args[0] === "worktree" && args[1] === "add") {
            addCalls++;
            if (addCalls === 1) git(root, ["branch", branch]);
            return {
              status: 128,
              stdout: "",
              stderr: "fatal: simulated worktree add failure\n",
            };
          }
          return gitCapture(repo, args);
        },
      });

      const failed = ensureWorktree(root, branch);
      expect(failed.ok).toBe(false);
      expect(git(root, ["branch", "--list", branch]).trim()).toBe("");

      setEnsureWorktreeTestSeam(null);
      const retry = ensureWorktree(root, branch);
      expect(retry.ok).toBe(true);
      expect(retry.created).toBe(true);
    } finally {
      clean();
    }
  });

  it("does not treat a ref-list timeout as missing branch when choosing -b", () => {
    const { root, clean } = makeRepo();
    try {
      const branch = "feat/ref-timeout";
      git(root, ["branch", branch]);
      const target = join(worktreesDir(root), branch);
      const addArgs: string[][] = [];
      setEnsureWorktreeTestSeam({
        localBranchExists: (_root, name) =>
          git(root, ["rev-parse", "--verify", `refs/heads/${name}^{commit}`]) !== null,
        gitCapture: (repo, args, timeoutMs): GitRun => {
          if (args[0] === "worktree" && args[1] === "add") {
            addArgs.push([...args]);
          }
          return gitCapture(repo, args, timeoutMs);
        },
      });

      const res = ensureWorktree(root, branch);
      expect(res.ok).toBe(true);
      expect(addArgs[0]).toEqual(["worktree", "add", target, branch]);
    } finally {
      clean();
    }
  });

  it("does not deadlock when ensureWorktree is reentered on the same branch", () => {
    const { root, clean } = makeRepo();
    try {
      const branch = "feat/reentrant";
      let nested = false;
      setEnsureWorktreeTestSeam({
        gitCapture: (repo, args, timeoutMs): GitRun => {
          if (!nested && args[0] === "worktree" && args[1] === "add" && args[2] === "-b") {
            nested = true;
            const inner = ensureWorktree(root, branch);
            expect(inner.ok).toBe(true);
          }
          return gitCapture(repo, args, timeoutMs);
        },
      });
      const res = ensureWorktree(root, branch);
      expect(res.ok).toBe(true);
      expect(nested).toBe(true);
    } finally {
      clean();
    }
  });

  it("serializes concurrent starts from separate processes on one branch", async () => {
    const { root, clean } = makeRepo();
    try {
      const branch = "feat/concurrent";
      const [ra, rb] = await Promise.all([
        runEnsureWorktreeInSubprocess(root, branch),
        runEnsureWorktreeInSubprocess(root, branch),
      ]);
      expect(ra.ok && rb.ok).toBe(true);
      expect(ra.path).toBe(rb.path);
      expect([ra.created, rb.created].filter(Boolean)).toHaveLength(1);
      const again = await runEnsureWorktreeInSubprocess(root, branch);
      expect(again.ok).toBe(true);
      expect(again.created).toBe(false);
    } finally {
      clean();
    }
  });
});
