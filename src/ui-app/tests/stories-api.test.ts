/**
 * Story mutation + delivery (#0480): setting/changing/clearing a story through
 * the shared write path, carrying it to the board payload, and the derived
 * roll-up updating when a task is retagged.
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig } from "../../core/types";
import { createRepoOS } from "../../core/repoos";
import { deriveStories } from "../../core/stories";
import { LiveIndex } from "../../server/live-index";
import { patchTaskFile } from "../../server/write";

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

function setupFile(content: string): { root: string; absPath: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-stories-api-"));
  const work = join(root, "work");
  mkdirSync(work, { recursive: true });
  const absPath = join(work, "0480-fixture.md");
  writeFileSync(absPath, content);
  return { root, absPath, clean: () => rmSync(root, { recursive: true, force: true }) };
}

const FILE = `---
id: "0480"
title: Fixture
type: feature
status: ready
---
Body
`;

describe("patchTaskFile story mutations", () => {
  it("sets a normalized story and records the change", () => {
    const { root, absPath, clean } = setupFile(FILE);
    try {
      const updated = patchTaskFile(config(root), absPath, { story: "  Project   updates " });
      expect(updated.story).toBe("Project updates");
      const onDisk = readFileSync(absPath, "utf8");
      expect(onDisk).toContain("story: Project updates");
      expect(onDisk).toContain("story");
    } finally {
      clean();
    }
  });

  it("changes a story and clears it without leaving the key behind", () => {
    const { root, absPath, clean } = setupFile(FILE);
    try {
      patchTaskFile(config(root), absPath, { story: "First slice" });
      const moved = patchTaskFile(config(root), absPath, { story: "Second slice" });
      expect(moved.story).toBe("Second slice");
      const cleared = patchTaskFile(config(root), absPath, { story: "" });
      expect(cleared.story).toBe("");
      expect(readFileSync(absPath, "utf8")).not.toContain("story:");
    } finally {
      clean();
    }
  });
});

describe("createTask story support", () => {
  it("persists a normalized story at creation", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-stories-create-"));
    try {
      const repoos = createRepoOS(root);
      const created = repoos.createTask({ title: "Email list task", story: "Project  updates" });
      expect(created.story).toBe("Project updates");
      expect(readFileSync(created.absPath, "utf8")).toContain("story: Project updates");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("board delivery + derived roll-up", () => {
  function writeTask(root: string, file: string, story: string): void {
    writeFileSync(
      join(root, "work", file),
      `---\nid: "${file.slice(0, 4)}"\ntitle: ${file}\ntype: feature\nstatus: ready\nstory: ${story}\n---\n`,
    );
  }

  it("carries story on the board payload and re-derives on retag", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-stories-board-"));
    try {
      const work = join(root, "work");
      mkdirSync(work, { recursive: true });
      writeTask(root, "0001-a.md", "Project updates email");
      writeTask(root, "0002-b.md", "Project updates email");
      writeTask(root, "0003-c.md", "Other slice");

      const index = new LiveIndex(config(root));
      index.refreshAll();
      const board = index.boardSnapshot().tasks;
      expect(board.map((t) => t.story)).toContain("Project updates email");

      const before = deriveStories(board);
      expect(before.map((s) => s.name).sort()).toEqual(["Other slice", "Project updates email"]);
      expect(before.find((s) => s.name === "Project updates email")?.total).toBe(2);

      // Retag #0002 to a third story and re-derive.
      patchTaskFile(config(root), join(work, "0002-b.md"), { story: "Third slice" });
      index.applyFileChange(join(work, "0002-b.md"));
      const after = deriveStories(index.boardSnapshot().tasks);
      expect(after.find((s) => s.name === "Project updates email")?.total).toBe(1);
      expect(after.find((s) => s.name === "Third slice")?.total).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
