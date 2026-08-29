/**
 * 0215 — close-out failure messages must match the phase that failed.
 *
 * The error card used to show one fixed conflict-resolution message for every
 * failure. These tests pin the per-phase mapping: a `check failed` reason
 * shows the check output and never mentions conflicts, a genuine conflict
 * still lists files + resolve guidance, a dirty tree says so, and `syncing`
 * says the branch couldn't be brought up to date.
 */
import { describe, expect, it } from "vitest";
import {
  classifyFailure,
  describeCloseOutFailure,
  extractConflicts,
  stripAnsi,
} from "../src/lib/closeOutFailure";

const CONFLICT_HINT =
  "RepoOS couldn't sync this branch with main automatically — resolve the conflicting files in the worktree, then retry.";

describe("classifyFailure", () => {
  it("classifies a merge conflict ahead of everything else", () => {
    expect(classifyFailure("validating", "merge conflict in src/a.ts — resolve it")).toBe(
      "conflict",
    );
    expect(classifyFailure("publishing", "merge conflict: src/a.ts")).toBe("conflict");
  });

  it("classifies a check/build failure (phase or reason) as validating", () => {
    expect(classifyFailure("validating", "check failed: boom")).toBe("validating");
    expect(classifyFailure(undefined, "check failed: boom")).toBe("validating");
    expect(classifyFailure(undefined, "repoos check failed: build")).toBe("validating");
    expect(classifyFailure(undefined, "build failed: tsc error")).toBe("validating");
  });

  it("classifies a dirty publish as dirty, not a conflict", () => {
    expect(classifyFailure("publishing", "main has 1 uncommitted file at publish time")).toBe(
      "dirty",
    );
  });

  it("classifies syncing failures", () => {
    expect(classifyFailure("syncing", "could not reset candidate to main")).toBe("syncing");
    expect(classifyFailure(undefined, "could not bring branch up to date")).toBe("syncing");
  });

  it("keeps other publish failures distinct from dirty", () => {
    expect(classifyFailure("publishing", "could not acquire publication lock")).toBe("publishing");
  });

  it("classifies unresolved conflict markers as conflict, not other", () => {
    expect(classifyFailure("validating", "unresolved conflict markers in src/config.ts")).toBe(
      "conflict",
    );
    expect(classifyFailure(undefined, "unresolved conflict markers in README.md")).toBe("conflict");
  });

  it("classifies 'could not verify main is clean at publish time' as dirty", () => {
    const reason =
      "could not verify main is clean at publish time (dirty). The candidate was NOT merged; retry, or commit/stash main's working tree first.";
    expect(classifyFailure("publishing", reason)).toBe("dirty");
    // Also matches when phase is undefined (sync-path /done handler).
    expect(classifyFailure(undefined, reason)).toBe("dirty");
  });

  it("classifies a reason with undefined phase as publishing, not other", () => {
    expect(classifyFailure(undefined, "could not acquire publication lock")).toBe("publishing");
  });
});

describe("describeCloseOutFailure", () => {
  it("maps a validating check failure to check output + retry, never conflicts", () => {
    const reason =
      "check failed: \u001b[31m✗\u001b[0m deletion detected by watcher\n  at tests/x.test.ts:12";
    const err = describeCloseOutFailure("validating", reason);

    // ANSI escapes are stripped from the reason before display.
    expect(reason).toContain("\u001b[31m");
    expect(err.message).not.toContain("\u001b[");
    expect(err.detail).not.toContain("\u001b[");
    expect(err.message).toContain("deletion detected by watcher");
    expect(err.conflicts).toEqual([]);
    expect(err.step).toBe("check");
    // The expanded panel keeps the newline-preserving excerpt.
    expect(err.detail).toContain("deletion detected by watcher");
    expect(err.detail).toContain("at tests/x.test.ts:12");
    // Never suggests resolving conflicts, does offer a retry.
    expect(err.hint).not.toMatch(/conflict/i);
    expect(err.hint).toMatch(/retry/i);
  });

  it("renders a check-failed reason even when the phase is unknown", () => {
    const err = describeCloseOutFailure(undefined, "repoos check failed: build");
    expect(err.message).toContain("build");
    expect(err.step).toBe("check");
    expect(err.conflicts).toEqual([]);
    expect(err.hint).not.toMatch(/conflict/i);
  });

  it("still lists conflicting files + resolve-then-retry for a genuine conflict", () => {
    const reason =
      "merge conflict in src/server/done.ts, src/ui/App.vue — resolve it in the feature branch's own worktree (merge main into the branch), then retry";
    const err = describeCloseOutFailure("validating", reason);
    expect(err.conflicts).toEqual(["src/server/done.ts", "src/ui/App.vue"]);
    expect(err.message).toMatch(/merge conflict/i);
    expect(err.hint).toBe(CONFLICT_HINT);
    // The concise headline summarizes; the full raw reason lives in detail.
    expect(err.detail).toBe(reason);
  });

  it("keeps a headline short even when the raw reason is huge, moving the rest to detail", () => {
    // A real merge-conflict reason can carry a long file listing/diff excerpt —
    // that must never end up rendered unclamped in the task panel (0253).
    const hugeReason =
      "merge conflict in " +
      Array.from({ length: 50 }, (_, i) => `src/file-${i}.ts`).join(", ") +
      " — resolve it";
    const err = describeCloseOutFailure(undefined, hugeReason);
    expect(err.message.length).toBeLessThanOrEqual(240);
    expect(err.detail).toBe(hugeReason);
    expect(err.conflicts.length).toBe(50);
  });

  it("caps a huge non-conflict reason's headline too, preserving the full text in detail", () => {
    const hugeReason = "could not acquire publication lock: " + "x".repeat(2000);
    const err = describeCloseOutFailure("publishing", hugeReason);
    expect(err.message.length).toBeLessThanOrEqual(240);
    expect(err.detail).toBe(hugeReason);
  });

  it("keeps the legacy conflict form working", () => {
    const err = describeCloseOutFailure(undefined, "merge conflict: src/a.ts, src/b.ts");
    expect(err.conflicts).toEqual(["src/a.ts", "src/b.ts"]);
    expect(err.hint).toBe(CONFLICT_HINT);
  });

  it("extracts files from 'unresolved conflict markers in X' form", () => {
    const err = describeCloseOutFailure(
      "validating",
      "unresolved conflict markers in src/config.ts",
    );
    expect(err.conflicts).toEqual(["src/config.ts"]);
    expect(err.hint).toBe(CONFLICT_HINT);
  });

  it("says the tree is dirty and names the files for a dirty publish", () => {
    const err = describeCloseOutFailure(
      "publishing",
      'main has 2 uncommitted files at publish time, so the merge would abort: dirty.txt, note.md. The candidate was NOT merged; commit or stash those on main (or use "Commit & continue") and retry.',
    );
    expect(err.conflicts).toEqual([]);
    expect(err.message).toContain("dirty.txt");
    expect(err.message).toContain("note.md");
    expect(err.step).toBe("publish");
    expect(err.hint).toMatch(/commit or stash/i);
    expect(err.hint).not.toBe(CONFLICT_HINT);
  });

  it("frames a syncing failure as the branch not being up to date", () => {
    const err = describeCloseOutFailure("syncing", "feature branch feat/x worktree not found");
    expect(err.message).toContain("could not be brought up to date with main");
    expect(err.message).toContain("feat/x");
    expect(err.step).toBe("sync");
    expect(err.hint).toMatch(/brought up to date/i);
  });

  it("falls back gracefully for an unknown phase and empty reason", () => {
    const err = describeCloseOutFailure(undefined, "");
    expect(err.message).toBe("The close-out failed.");
    expect(err.conflicts).toEqual([]);
  });
});

describe("stripAnsi", () => {
  it("strips SGR escapes including color codes", () => {
    expect(stripAnsi("\u001b[31merror\u001b[0m: boom \u001b[1;34mblue\u001b[0m")).toBe(
      "error: boom blue",
    );
  });
});
