import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const serverRoot = join(root, "src/server");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx|js|mjs)$/.test(entry.name) && !entry.name.endsWith(".test.ts")
      ? [path]
      : [];
  });
}

describe("server git blocking guard", () => {
  it("does not use synchronous child-process APIs anywhere in server code", () => {
    const violations = sourceFiles(serverRoot).flatMap((path) => {
      const source = readFileSync(path, "utf8");
      return /\b(?:execFileSync|spawnSync|execSync)\s*\(/.test(source)
        ? [path.replace(`${root}/`, "")]
        : [];
    });
    expect(violations).toEqual([]);
  });

  it("does not add synchronous child processes to HTTP route handlers", () => {
    const routeFiles = sourceFiles(join(serverRoot, "routes"));
    const violations = routeFiles.flatMap((path) => {
      const source = readFileSync(path, "utf8");
      return /\b(?:execFileSync|spawnSync|execSync)\s*\(/.test(source)
        ? [path.replace(`${root}/`, "")]
        : [];
    });
    expect(violations).toEqual([]);
  });

  it("does not call Git through synchronous process APIs in server code", () => {
    const watched = [
      "src/server/live-index.ts",
      "src/server/task-watchdog.ts",
      "src/server/agents.ts",
      "src/server/write.ts",
      "src/server/close-out-task-status.ts",
      "src/server/handoff-failure-loop.ts",
      "src/server/review-verification-gather.ts",
      "src/server/server.ts",
    ];
    const counts = Object.fromEntries(
      sourceFiles(serverRoot).flatMap((path) => {
        const source = readFileSync(path, "utf8");
        const directSyncGit = [
          ...source.matchAll(/\b(?:execFileSync|spawnSync|execSync)\s*\(\s*["']git["']/g),
        ].length;
        return directSyncGit > 0 ? [[path.replace(`${root}/`, ""), directSyncGit]] : [];
      }),
    );
    for (const path of watched) expect(counts[path] ?? 0).toBe(0);
    expect(counts).toEqual({});
  });

  it("does not import and call synchronous Git read helpers from server code", () => {
    const syncGitReads = new Set([
      "branchAheadCounts",
      "branchRefSnapshot",
      "branchChangesSinceBase",
      "branchCommit",
      "currentBranch",
      "isAncestor",
      "lastCommitForFile",
      "lastCommitsForDir",
      "worktreeList",
      "worktreePathForBranch",
      "worktreePaths",
      "worktreeStatus",
    ]);
    const violations: string[] = [];
    for (const path of sourceFiles(serverRoot)) {
      // These core helpers run in the dedicated Git child, not on the HTTP thread.
      if (path.endsWith("/git-worker-entry.ts")) continue;
      const source = readFileSync(path, "utf8");
      for (const match of source.matchAll(
        /import\s*\{([^}]+)\}\s*from\s*["'][^"']*core\/git(?:\.js)?["']/g,
      )) {
        for (const specifier of match[1].split(",")) {
          const [imported, alias] = specifier.trim().split(/\s+as\s+/);
          if (!syncGitReads.has(imported)) continue;
          const local = alias ?? imported;
          if (new RegExp(`(?<![.\\w])${local}\\s*\\(`).test(source)) {
            violations.push(`${path.replace(`${root}/`, "")}:${local}`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("does not call blocking core probes from server handlers or timers", () => {
    const blockingHelpers = new Set([
      "availableMemBytes",
      "heavyJobCounts",
      "pressureSnapshotForDisplay",
      "sweepAndWarn",
    ]);
    const violations: string[] = [];
    for (const path of sourceFiles(serverRoot)) {
      if (path.endsWith("/git-worker-entry.ts")) continue;
      const source = readFileSync(path, "utf8");
      for (const match of source.matchAll(
        /import\s*\{([^}]+)\}\s*from\s*["'][^"']*core\/[^"']+["']/g,
      )) {
        for (const specifier of match[1].split(",")) {
          const [imported, alias] = specifier.trim().split(/\s+as\s+/);
          if (!blockingHelpers.has(imported)) continue;
          const local = alias ?? imported;
          if (new RegExp(`(?<![.\\w])${local}\\s*\\(`).test(source)) {
            violations.push(`${path.replace(`${root}/`, "")}:${local}`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("keeps context-pack and bootstrap Git/process reads off the server thread", () => {
    const bootstrap = readFileSync(join(root, "src/core/bootstrap.ts"), "utf8");
    expect(bootstrap).not.toMatch(/\b(?:execFileSync|spawnSync|execSync)\s*\(/);

    const gitCore = readFileSync(join(root, "src/core/git.ts"), "utf8");
    expect(gitCore).not.toMatch(
      /gitAsync\(root,\s*\["rev-list",\s*"--count",\s*`\$\{base\}\.\.\$\{branch\}`/,
    );

    const serverContext = readFileSync(join(serverRoot, "context-pack.ts"), "utf8");
    expect(serverContext).toContain(".contextPackFacts(config.root, cwd)");
    expect(serverContext).toContain("bootstrapResult, gitFacts");
    expect(serverContext).toContain("cwd, gitFacts");

    const directImports = sourceFiles(serverRoot).flatMap((path) => {
      const source = readFileSync(path, "utf8");
      return /from\s*["'][^"']*core\/context-pack(?:\.js)?["']/.test(source)
        ? [path.replace(`${root}/`, "")]
        : [];
    });
    expect(
      directImports.filter(
        (path) => path !== "src/server/context-pack.ts" && path !== "src/server/git-worker.ts",
      ),
    ).toEqual([]);
  });
});
