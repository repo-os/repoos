import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import {
  isSafeToAutoCommit,
  docCurrentlyContains,
  repoActuallyContains,
  repoSearchContains,
  type ProposedFix,
} from "../../server/auto-fix-gate.js";

/** Create a throwaway repo root with the given files (relative paths). */
function makeRepo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-gate-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

describe("docCurrentlyContains", () => {
  it("returns true when the file contains the text", () => {
    const root = makeRepo({ "docs/guide.md": "See `src/util.ts` for helpers." });
    expect(docCurrentlyContains("docs/guide.md", "src/util.ts", root)).toBe(true);
  });

  it("returns false when the file does not contain the text", () => {
    const root = makeRepo({ "docs/guide.md": "See `src/other.ts` for helpers." });
    expect(docCurrentlyContains("docs/guide.md", "src/util.ts", root)).toBe(false);
  });

  it("returns false when the file does not exist", () => {
    const root = makeRepo({});
    expect(docCurrentlyContains("docs/missing.md", "anything", root)).toBe(false);
  });
});

describe("repoSearchContains", () => {
  it("finds text in a nested file", () => {
    const root = makeRepo({
      "src/deep/nested/file.ts": "export const TARGET = 42;",
    });
    const result = repoSearchContains(root, "TARGET = 42");
    expect(result.found).toBe(true);
    expect(result.exhausted).toBe(false);
  });

  it("returns not-found when text is absent", () => {
    const root = makeRepo({
      "src/file.ts": "export const X = 1;",
    });
    const result = repoSearchContains(root, "DOES_NOT_EXIST");
    expect(result.found).toBe(false);
    expect(result.exhausted).toBe(false);
  });

  it("returns not-found for empty text", () => {
    const root = makeRepo({});
    const result = repoSearchContains(root, "");
    expect(result.found).toBe(false);
  });

  it("skips node_modules", () => {
    const root = makeRepo({
      "node_modules/pkg/index.js": "export const FOUND = true;",
    });
    const result = repoSearchContains(root, "FOUND = true");
    expect(result.found).toBe(false);
  });

  it("skips .git directory", () => {
    const root = makeRepo({
      ".git/config": "core.found = true",
    });
    const result = repoSearchContains(root, "core.found = true");
    expect(result.found).toBe(false);
  });

  it("reports exhausted when maxFiles cap is hit", () => {
    // Create many files at root level as decoys, target in a subdirectory.
    // The walk processes root-level files first, so with a small maxFiles
    // the subdirectory is never entered and the search is exhausted.
    const files: Record<string, string> = {};
    for (let i = 0; i < 20; i++) {
      files[`decoy${String(i).padStart(2, "0")}.ts`] = `const d${i} = ${i};`;
    }
    files["nested/target.ts"] = "const TARGET = 42;";
    const root = makeRepo(files);
    // With maxFiles=3, only 3 root-level decoy files are checked
    const limited = repoSearchContains(root, "TARGET = 42", 3);
    expect(limited.found).toBe(false);
    expect(limited.exhausted).toBe(true);
    // With enough headroom, the nested dir is entered and target found
    const full = repoSearchContains(root, "TARGET = 42", 30);
    expect(full.found).toBe(true);
    expect(full.exhausted).toBe(false);
  });
});

describe("repoActuallyContains", () => {
  it("finds text present in the repo", () => {
    const root = makeRepo({ "src/index.ts": "export function mainModule() {}" });
    expect(repoActuallyContains(root, "export function mainModule() {}")).toBe(true);
  });

  it("returns false when text is absent and has no verifiable identifiers", () => {
    const root = makeRepo({ "src/index.ts": "export const other = 1;" });
    expect(repoActuallyContains(root, "zzzNonexistent999")).toBe(false);
  });

  it("passes when newText contains an identifier that exists in the repo", () => {
    const root = makeRepo({
      "src/util.ts": "export function parseConfig() { return {}; }",
    });
    // newText is a sentence, but contains the identifier `parseConfig` which exists
    expect(repoActuallyContains(root, "Use parseConfig() instead of the old path")).toBe(true);
  });

  it("passes when newText is an existing file path", () => {
    const root = makeRepo({ "src/new.ts": "export const x = 1;" });
    expect(repoActuallyContains(root, "src/new.ts")).toBe(true);
  });
});

describe("isSafeToAutoCommit", () => {
  it("returns true when oldText is in the doc and newText is in the repo", () => {
    const root = makeRepo({
      "docs/guide.md": "Use `src/old.ts` for utils.",
      "src/new.ts": "export const util = 1;",
    });
    const fix: ProposedFix = {
      doc: "docs/guide.md",
      oldText: "src/old.ts",
      newText: "src/new.ts",
    };
    expect(isSafeToAutoCommit(fix, root)).toBe(true);
  });

  it("returns false when oldText is stale (not in the doc)", () => {
    const root = makeRepo({
      "docs/guide.md": "Use `src/current.ts` for utils.",
      "src/new.ts": "export const util = 1;",
    });
    const fix: ProposedFix = {
      doc: "docs/guide.md",
      oldText: "src/old.ts",
      newText: "src/new.ts",
    };
    expect(isSafeToAutoCommit(fix, root)).toBe(false);
  });

  it("returns false when newText is wrong (not in the repo)", () => {
    const root = makeRepo({
      "docs/guide.md": "Use `src/old.ts` for utils.",
    });
    const fix: ProposedFix = {
      doc: "docs/guide.md",
      oldText: "src/old.ts",
      newText: "zzzFake999",
    };
    expect(isSafeToAutoCommit(fix, root)).toBe(false);
  });

  it("returns false when both oldText is stale and newText is wrong", () => {
    const root = makeRepo({
      "docs/guide.md": "Use `src/current.ts` for utils.",
    });
    const fix: ProposedFix = {
      doc: "docs/guide.md",
      oldText: "src/old.ts",
      newText: "zzzFake999",
    };
    expect(isSafeToAutoCommit(fix, root)).toBe(false);
  });

  it("returns false when the doc file does not exist", () => {
    const root = makeRepo({
      "src/new.ts": "export const util = 1;",
    });
    const fix: ProposedFix = {
      doc: "docs/missing.md",
      oldText: "src/old.ts",
      newText: "src/new.ts",
    };
    expect(isSafeToAutoCommit(fix, root)).toBe(false);
  });

  it("returns false when doc is empty", () => {
    const root = makeRepo({ "src/new.ts": "export const util = 1;" });
    expect(isSafeToAutoCommit({ doc: "", oldText: "x", newText: "src/new.ts" }, root)).toBe(false);
  });

  it("returns false when oldText is empty", () => {
    const root = makeRepo({
      "docs/guide.md": "content",
      "src/new.ts": "export const util = 1;",
    });
    expect(
      isSafeToAutoCommit({ doc: "docs/guide.md", oldText: "", newText: "src/new.ts" }, root),
    ).toBe(false);
  });

  it("returns false when newText is empty", () => {
    const root = makeRepo({ "docs/guide.md": "Use `src/old.ts`." });
    expect(
      isSafeToAutoCommit({ doc: "docs/guide.md", oldText: "src/old.ts", newText: "" }, root),
    ).toBe(false);
  });

  it("returns false when doc path contains traversal", () => {
    const root = makeRepo({
      "docs/guide.md": "Use `src/old.ts`.",
      "src/new.ts": "export const util = 1;",
    });
    expect(
      isSafeToAutoCommit({ doc: "../etc/passwd", oldText: "x", newText: "src/new.ts" }, root),
    ).toBe(false);
  });

  it("passes when newText is a sentence with a verifiable identifier", () => {
    const root = makeRepo({
      "docs/guide.md": "Use `src/old.ts` for helpers.",
      "src/config.ts": "export function loadConfig() { return {}; }",
    });
    const fix: ProposedFix = {
      doc: "docs/guide.md",
      oldText: "src/old.ts",
      newText: "Use loadConfig() from src/config.ts",
    };
    expect(isSafeToAutoCommit(fix, root)).toBe(true);
  });
});
