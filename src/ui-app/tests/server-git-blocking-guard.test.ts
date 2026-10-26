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
});
