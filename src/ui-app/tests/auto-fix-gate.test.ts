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
    expect(repoSearchContains(root, "TARGET = 42")).toBe(true);
  });

  it("returns false when text is not found", () => {
    const root = makeRepo({
      "src/file.ts": "export const X = 1;",
    });
    expect(repoSearchContains(root, "DOES_NOT_EXIST")).toBe(false);
  });

  it("returns true for empty text", () => {
    const root = makeRepo({});
    expect(repoSearchContains(root, "")).toBe(true);
  });

  it("skips node_modules", () => {
    const root = makeRepo({
      "node_modules/pkg/index.js": "export const FOUND = true;",
    });
    expect(repoSearchContains(root, "FOUND = true")).toBe(false);
  });

  it("skips .git directory", () => {
    const root = makeRepo({
      ".git/config": "core.found = true",
    });
    expect(repoSearchContains(root, "core.found = true")).toBe(false);
  });

  it("respects maxFiles limit", () => {
    // Create many files at root level as decoys, target in a subdirectory.
    // The walk processes root-level files first (they're in the root dir entry list),
    // so with a small maxFiles the subdirectory is never entered.
    const files: Record<string, string> = {};
    for (let i = 0; i < 20; i++) {
      files[`decoy${String(i).padStart(2, "0")}.ts`] = `const d${i} = ${i};`;
    }
    files["nested/target.ts"] = "const TARGET = 42;";
    const root = makeRepo(files);
    // With maxFiles=3, only 3 root-level decoy files are checked
    expect(repoSearchContains(root, "TARGET = 42", 3)).toBe(false);
    // With enough headroom, the nested dir is entered and target found
    expect(repoSearchContains(root, "TARGET = 42", 30)).toBe(true);
  });
});

describe("repoActuallyContains", () => {
  it("finds text present in the repo", () => {
    const root = makeRepo({ "src/index.ts": "export const main = () => {};" });
    expect(repoActuallyContains(root, "export const main")).toBe(true);
  });

  it("returns false when text is absent", () => {
    const root = makeRepo({ "src/index.ts": "export const other = 1;" });
    expect(repoActuallyContains(root, "DOES_NOT_EXIST")).toBe(false);
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
      oldText: "src/old.ts", // stale — doc has src/current.ts
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
      newText: "src/fake.ts", // hallucinated — doesn't exist
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
      newText: "src/fake.ts",
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
});
