import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadDiffSnapshot, saveDiffSnapshot } from "../../server/diff-snapshot";

describe("durable task diff snapshots", () => {
  it("round-trips a completed task's stats and patch", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-diff-snapshot-"));
    try {
      saveDiffSnapshot(root, ".repoos", "0123", {
        filesChanged: 2,
        additions: 14,
        deletions: 3,
      }, {
        patch: "diff --git a/a.ts b/a.ts\n",
        truncated: false,
      });

      expect(loadDiffSnapshot(root, ".repoos", "0123")).toMatchObject({
        stats: { filesChanged: 2, additions: 14, deletions: 3 },
        diff: { patch: "diff --git a/a.ts b/a.ts\n", truncated: false },
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not create paths from an unsafe task id", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-diff-snapshot-"));
    try {
      saveDiffSnapshot(root, ".repoos", "../escape", {
        filesChanged: 1,
        additions: 1,
        deletions: 0,
      }, { patch: "x", truncated: false });
      expect(loadDiffSnapshot(root, ".repoos", "../escape")).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
