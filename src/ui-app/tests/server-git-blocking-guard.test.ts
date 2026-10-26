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
    const violations = sourceFiles(serverRoot).flatMap((path) => {
      const source = readFileSync(path, "utf8");
      const directSyncGit = /\b(?:execFileSync|spawnSync|execSync)\s*\(\s*["']git["']/.test(source);
      return directSyncGit ? [path.replace(`${root}/`, "")] : [];
    });
    expect(violations).toEqual([]);
  });
});
