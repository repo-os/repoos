/**
 * Unit tests for the lexical file-relevance scorer (#0650).
 *
 * The scorer lives in `src/core/keyword-rank.ts`; the tests live here because
 * the vitest config only discovers `src/ui-app/tests/**` (see
 * `src/ui-app/vite.config.ts`). They cover the three ranking properties the
 * task calls out: rare terms outrank common ones, a path/export hit outranks a
 * body hit, and ties order deterministically.
 */
import { describe, expect, it } from "vitest";
import {
  buildFileLexicalIndex,
  scoreKeywordRelevance,
  scoreTaskKeywordRelevance,
  tokenize,
} from "../../core/keyword-rank.js";
import { rankFiles, type RepoMap } from "../../core/context-pack.js";
import type { RepoOSConfig, Task } from "../../core/types.js";

function lexical(path: string, content: string) {
  return buildFileLexicalIndex(path, content);
}

function topPath(scores: Map<string, { score: number }>): string {
  return [...scores.entries()].sort((a, b) => b[1].score - a[1].score)[0]![0];
}

function makeConfig(): RepoOSConfig {
  return {
    root: "/fake/root",
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "0650",
    title: "Test task",
    type: "feature",
    status: "active",
    needsInput: false,
    needsMerge: false,
    noSourceChange: false,
    priority: "p2",
    area: "unknown",
    areas: ["unknown"],
    assignee: "ai",
    assignedTo: "ai",
    createdBy: "",
    branch: "feat/test",
    tags: [],
    created_at: "2026-10-04T00:00:00Z",
    updated_at: "2026-10-04T00:00:00Z",
    path: "work/0650-test.md",
    absPath: "/fake/root/work/0650-test.md",
    body: "",
    extra: {},
    agentOverride: null,
    cliOverride: null,
    modelOverride: null,
    git: {
      branchExists: true,
      worktreeExists: false,
      lastCommit: null,
      lastCommitAt: null,
      worktreePath: null,
      dirty: false,
    },
    ...overrides,
  };
}

function makeRepoMap(files: { path: string; content?: string }[]): RepoMap {
  return {
    indexVersion: 2,
    headHash: "test",
    generatedAt: "2026-10-04T00:00:00Z",
    roots: ["src"],
    files: files.map((f) => ({
      path: f.path,
      size: (f.content ?? "").length,
      imports: [],
      mtimeMs: 0,
      lexical: lexical(f.path, f.content ?? ""),
    })),
  };
}

describe("tokenize", () => {
  it("splits camelCase into subtokens while keeping the whole identifier", () => {
    const tokens = tokenize("renderPack");
    expect(tokens).toContain("renderpack");
    expect(tokens).toContain("render");
    expect(tokens).toContain("pack");
  });

  it("splits snake_case and drops single-character noise", () => {
    expect(tokenize("build_context_pack")).toEqual(
      expect.arrayContaining(["build", "context", "pack"]),
    );
    expect(tokenize("a b")).not.toContain("a");
  });
});

describe("scoreKeywordRelevance", () => {
  it("ranks a rare term above a common term", () => {
    const files = [lexical("src/core/alpha.ts", "common")];
    // Fillers make "common" a near-every-file term so its IDF collapses.
    for (let i = 0; i < 11; i++) {
      files.push(lexical(`src/core/filler${i}.ts`, "common"));
    }
    files.push(lexical("src/core/beta.ts", "rare"));

    const scores = scoreKeywordRelevance(files, "common rare");
    expect(scores.get("src/core/beta.ts")!.score).toBeGreaterThan(
      scores.get("src/core/alpha.ts")!.score,
    );
    expect(topPath(scores)).toBe("src/core/beta.ts");
  });

  it("ranks a path hit above a body hit for the same term", () => {
    const files = [
      lexical("src/core/widget.ts", "export function nothingHere() {}"),
      lexical("src/core/other.ts", "export function widgetThing() {}"),
    ];
    const scores = scoreKeywordRelevance(files, "widget");
    expect(scores.get("src/core/widget.ts")!.score).toBeGreaterThan(
      scores.get("src/core/other.ts")!.score,
    );
  });

  it("ranks an exported-name hit above a comment mention", () => {
    const files = [
      lexical("src/core/a.ts", "export function renderPack() {}"),
      lexical("src/core/b.ts", "/** renderPack is mentioned here in a comment */"),
    ];
    const scores = scoreKeywordRelevance(files, "render pack");
    expect(scores.get("src/core/a.ts")!.score).toBeGreaterThan(scores.get("src/core/b.ts")!.score);
  });
});

describe("scoreTaskKeywordRelevance", () => {
  it("weights a title term above a body term", () => {
    const files = [
      lexical("src/core/one.ts", "export const widget = 1;"),
      lexical("src/core/two.ts", "export const gadget = 1;"),
    ];
    const scores = scoreTaskKeywordRelevance(files, "widget", "gadget");
    expect(scores.get("src/core/one.ts")!.score).toBeGreaterThan(
      scores.get("src/core/two.ts")!.score,
    );
  });
});

describe("rankFiles stable ordering", () => {
  const config = makeConfig();

  it("breaks ties deterministically by path", () => {
    // Identical content and path shape (only the directory letter differs),
    // no area match, no recency — so the two files tie on every signal.
    const map = makeRepoMap([
      { path: "src/b/foo.ts", content: "export const foo = 1;" },
      { path: "src/a/foo.ts", content: "export const foo = 1;" },
    ]);
    const task = makeTask({ area: "unknown", areas: ["unknown"], body: "foo", title: "foo" });

    const result = rankFiles(config, task, map);
    const fooOrder = result.filter((f) => f.path.endsWith("/foo.ts")).map((f) => f.path);
    expect(fooOrder).toEqual(["src/a/foo.ts", "src/b/foo.ts"]);
  });

  it("gives a keyword-matching file a keyword reason and a positive rank", () => {
    const map = makeRepoMap([
      { path: "src/core/context-pack.ts", content: "export function renderPack() {}" },
      { path: "src/core/unrelated.ts", content: "export const x = 1;" },
    ]);
    const task = makeTask({
      area: "unknown",
      areas: ["unknown"],
      title: "Rank context pack files",
      body: "Improve renderPack relevance.",
    });

    const result = rankFiles(config, task, map);
    const pack = result.find((f) => f.path === "src/core/context-pack.ts")!;
    expect(pack.rank).toBeGreaterThan(0);
    expect(pack.reason).toContain("keyword relevance");
  });
});
