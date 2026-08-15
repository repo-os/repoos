import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig } from "../../core/types";
import { LiveIndex } from "../../server/live-index";

function config(root: string): RepoOSConfig {
  return {
    root,
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
  };
}

describe("LiveIndex board snapshot", () => {
  it("omits full task detail while retaining a bounded search preview", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-board-index-"));
    try {
      const work = join(root, "work");
      mkdirSync(work, { recursive: true });
      writeFileSync(join(work, "0223-board.md"), `---
id: "0223"
title: Board payload fixture
type: bug
status: active
priority: p1
area: web
---
${"x".repeat(650)}
`);

      const index = new LiveIndex(config(root));
      index.refreshAll();
      const task = index.boardSnapshot().tasks[0];

      expect(task.bodyPreview).toHaveLength(500);
      expect(task).not.toHaveProperty("body");
      expect(task).not.toHaveProperty("activity");
      expect(task).not.toHaveProperty("extra");
      expect(task).not.toHaveProperty("agentOverride");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
