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
    const expectedLegacyGitReadSites: Record<string, number> = {
      "src/server/agents.ts": 1,
      "src/server/close-out-task-status.ts": 1,
      "src/server/handoff-failure-loop.ts": 1,
      "src/server/review-verification-gather.ts": 3,
      "src/server/task-watchdog.ts": 2,
      "src/server/write.ts": 1,
    };
    const counts = Object.fromEntries(
      sourceFiles(serverRoot).flatMap((path) => {
        const source = readFileSync(path, "utf8");
        const directSyncGit = [
          ...source.matchAll(/\b(?:execFileSync|spawnSync|execSync)\s*\(\s*["']git["']/g),
        ].length;
        return directSyncGit > 0 ? [[path.replace(`${root}/`, ""), directSyncGit]] : [];
      }),
    );
    // These pre-existing callsites remain isolated in older non-route paths;
    // this baseline makes any newly added synchronous Git call fail the gate.
    expect(counts).toEqual(expectedLegacyGitReadSites);
  });
});
