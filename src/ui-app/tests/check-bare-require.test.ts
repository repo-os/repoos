/**
 * `repoos check`'s bare-require guard (#0352). The bug it guards — a bare
 * `require` in a `"type": "module"` package throws in the compiled ESM output,
 * silently if caught — is generic, but the directories to scan used to be the
 * hardcoded RepoOS layout `src/{core,server,commands,cli}`. Roots now come from
 * `[check] bareRequireDirs`, else the repo's tsconfig `include`/`exclude`; and
 * a non-module package skips. The last block keeps RepoOS's own coverage from
 * silently becoming a vacuous pass.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  bareRequireOffenders,
  readTsconfig,
  resolveBareRequireRoots,
} from "../../commands/check.js";
import { loadConfig } from "../../core/config.js";

const roots: string[] = [];
afterEach(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
  roots.length = 0;
});
function tmpRepo(): string {
  const d = mkdtempSync(join(tmpdir(), "repoos-check-require-"));
  roots.push(d);
  return d;
}
function write(root: string, relPath: string, content: string): void {
  const full = join(root, relPath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
}

describe("resolveBareRequireRoots", () => {
  it("prefers explicit [check] bareRequireDirs over tsconfig", () => {
    const resolved = resolveBareRequireRoots(["packages/app/src"], {
      include: ["src/**/*.ts"],
    });
    expect(resolved.source).toBe("config");
    expect(resolved.roots).toEqual(["packages/app/src"]);
  });

  it("derives roots from a tsconfig include list and keeps its excludes", () => {
    const resolved = resolveBareRequireRoots(undefined, {
      include: ["src/**/*.ts"],
      exclude: ["src/ui-app", "node_modules"],
    });
    expect(resolved.source).toBe("tsconfig");
    expect(resolved.roots).toEqual(["src"]);
    expect(resolved.excludes).toContain("src/ui-app");
  });

  it("keeps a file-level exclude as a file, not its parent directory", () => {
    // Collapsing src/legacy.ts to `src` used to make the guard skip the whole
    // tree and pass vacuously (#0352 review).
    const resolved = resolveBareRequireRoots(undefined, {
      include: ["src/**/*.ts"],
      exclude: ["src/legacy.ts"],
    });
    expect(resolved.excludes).toEqual(["src/legacy.ts"]);
  });

  it("carries [check] bareRequireExcludes when the roots are configured", () => {
    const resolved = resolveBareRequireRoots(["src"], null, ["src/generated/**/*.ts"]);
    expect(resolved.source).toBe("config");
    expect(resolved.excludes).toEqual(["src/generated/**/*.ts"]);
  });

  it("dedupes a root that is a descendant of another", () => {
    const resolved = resolveBareRequireRoots(undefined, {
      include: ["packages/**/*.ts", "packages/app/src/**/*.ts"],
    });
    expect(resolved.roots).toEqual(["packages"]);
  });

  it("maps a whole-repo glob to the repo root", () => {
    expect(resolveBareRequireRoots(undefined, { include: ["**/*.ts"] }).roots).toEqual(["."]);
  });

  it("reports no source when neither config nor tsconfig yields a root", () => {
    const resolved = resolveBareRequireRoots(undefined, null);
    expect(resolved.source).toBe("none");
    expect(resolved.roots).toEqual([]);
  });

  it("ignores unusable configured rows (absolute, home, ..)", () => {
    const resolved = resolveBareRequireRoots(["/abs/src", "~/src", "../src"], {
      include: ["lib/**/*.ts"],
    });
    expect(resolved.source).toBe("tsconfig");
    expect(resolved.roots).toEqual(["lib"]);
  });
});

describe("readTsconfig", () => {
  it("parses JSONC comments and trailing commas", () => {
    const root = tmpRepo();
    writeFileSync(
      join(root, "tsconfig.json"),
      ["{", "  // a comment", '  "include": ["app/**/*.ts",],', "}", ""].join("\n"),
    );
    expect(readTsconfig(root)?.include).toEqual(["app/**/*.ts"]);
  });

  it("returns null when there is no tsconfig", () => {
    expect(readTsconfig(tmpRepo())).toBeNull();
  });

  it("leaves a `,]` inside a string value untouched", () => {
    const root = tmpRepo();
    writeFileSync(join(root, "tsconfig.json"), '{ "files": ["odd,].ts"] }');
    expect(readTsconfig(root)?.files).toEqual(["odd,].ts"]);
  });
});

describe("bareRequireOffenders", () => {
  it("scans a non-RepoOS layout and flags a bare require", () => {
    const root = tmpRepo();
    write(root, "app/lib/thing.ts", 'const fs = require("fs");\n');
    expect(bareRequireOffenders(["app"], { repoRoot: root })).toEqual(["app/lib/thing.ts:1"]);
  });

  it("exempts files that use createRequire and skips *.test.ts", () => {
    const root = tmpRepo();
    write(root, "app/a.ts", 'const r = createRequire(import.meta.url); r("fs");\n');
    write(root, "app/b.test.ts", 'const fs = require("fs");\n');
    expect(bareRequireOffenders(["app"], { repoRoot: root })).toEqual([]);
  });

  it("honors an exclude directory", () => {
    const root = tmpRepo();
    write(root, "app/kept.ts", 'require("fs");\n');
    write(root, "app/skip/me.ts", 'require("fs");\n');
    expect(bareRequireOffenders(["app"], { repoRoot: root, excludes: ["app/skip"] })).toEqual([
      "app/kept.ts:1",
    ]);
  });

  it("honors a file-level exclude without skipping its directory", () => {
    const root = tmpRepo();
    write(root, "app/kept.ts", 'require("fs");\n');
    write(root, "app/legacy.ts", 'require("fs");\n');
    expect(bareRequireOffenders(["app"], { repoRoot: root, excludes: ["app/legacy.ts"] })).toEqual([
      "app/kept.ts:1",
    ]);
  });

  it("honors a glob exclude", () => {
    const root = tmpRepo();
    write(root, "app/kept.ts", 'require("fs");\n');
    write(root, "app/a.spec.ts", 'require("fs");\n');
    write(root, "app/deep/b.spec.ts", 'require("fs");\n');
    expect(bareRequireOffenders(["app"], { repoRoot: root, excludes: ["**/*.spec.ts"] })).toEqual([
      "app/kept.ts:1",
    ]);
  });

  it("ignores commented-out require calls", () => {
    const root = tmpRepo();
    write(root, "app/a.ts", '// require("fs")\n * require("os")\n');
    expect(bareRequireOffenders(["app"], { repoRoot: root })).toEqual([]);
  });
});

describe("loadConfig [check] bare-require parsing", () => {
  it("reads bareRequireDirs and bareRequireExcludes (both [check] spellings)", () => {
    const root = tmpRepo();
    writeFileSync(
      join(root, "repoos.toml"),
      [
        "[checks]",
        'bareRequireDirs = ["app/src", "lib"]',
        'bareRequireExcludes = ["app/src/generated"]',
        "",
      ].join("\n"),
    );
    const cfg = loadConfig(root).check;
    expect(cfg?.bareRequireDirs).toEqual(["app/src", "lib"]);
    expect(cfg?.bareRequireExcludes).toEqual(["app/src/generated"]);
  });
});

describe("RepoOS dogfoods the bare-require declaration", () => {
  const root = resolve(__dirname, "../../..");

  it("declares its source roots through the generic [check] section", () => {
    expect(loadConfig(root).check?.bareRequireDirs).toEqual([
      "src/core",
      "src/server",
      "src/commands",
      "src/cli",
    ]);
  });

  it("keeps its current coverage: the real tree still has no bare requires", () => {
    const cfg = loadConfig(root).check;
    const resolved = resolveBareRequireRoots(cfg?.bareRequireDirs, readTsconfig(root));
    expect(resolved.source).toBe("config");
    // src/ui-app is intentionally out of scope; excluding it is what the old
    // hardcoded RepoOS list did implicitly, so coverage is unchanged.
    expect(resolved.roots).not.toContain("src/ui-app");
    expect(
      bareRequireOffenders(resolved.roots, { repoRoot: root, excludes: resolved.excludes }),
    ).toEqual([]);
  });
});
