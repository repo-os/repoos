/**
 * Note mechanism (0295): a short, free-form note appended to a task's activity
 * log — surfaced where the activity/history is shown — without rewriting the
 * task body. Covers the server path (`patchTaskFile` with a `note`) and the
 * core path (`addNote`, and `updateStatus` with a note combined in one op).
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig } from "../../core/types";
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
  const root = mkdtempSync(join(tmpdir(), "repoos-note-"));
  const work = join(root, "work");
  mkdirSync(work, { recursive: true });
  const absPath = join(work, "0295-note.md");
  writeFileSync(absPath, content);
  return { root, absPath, clean: () => rmSync(root, { recursive: true, force: true }) };
}

const PLAIN = `---
id: "0295"
title: Note mechanism
type: feature
status: review
---
## Problem

Body.

## Activity

- 2026-08-25T10:00:00Z · status active→review
`;

describe("task note mechanism", () => {
  it("records a note as its own activity entry without rewriting the body", () => {
    const { root, absPath, clean } = setupFile(PLAIN);
    try {
      const updated = patchTaskFile(config(root), absPath, {
        note: "Fix the regression in checkout; see review",
      });

      expect(updated.status).toBe("review");
      expect(updated.body).toContain("# Problem");
      expect(updated.body).toContain("Body.");
      const noteEntry = updated.body.split("\n").find((l) => l.includes("· note:"));
      expect(noteEntry).toBeTruthy();
      expect(noteEntry).toContain("note: Fix the regression in checkout; see review");
      // Prior activity entry is preserved.
      expect(updated.body).toContain("status active→review");
    } finally {
      clean();
    }
  });

  it("combines a status transition with a note in a single operation", () => {
    const { root, absPath, clean } = setupFile(PLAIN);
    try {
      const updated = patchTaskFile(config(root), absPath, {
        status: "active",
        note: "Handle the reviewer's suggestions",
      });

      expect(updated.status).toBe("active");
      expect(updated.body).toContain("status review→active");
      expect(updated.body).toContain("note: Handle the reviewer's suggestions");
    } finally {
      clean();
    }
  });

  it("ignores an empty or whitespace-only note", () => {
    const { root, absPath, clean } = setupFile(PLAIN);
    try {
      const updated = patchTaskFile(config(root), absPath, { note: "   " });
      expect(updated.body.split("\n").filter((l) => l.includes("· note:")).length).toBe(0);
    } finally {
      clean();
    }
  });

  it("leaves a plain status transition (no note) unchanged", () => {
    const { root, absPath, clean } = setupFile(PLAIN);
    try {
      const updated = patchTaskFile(config(root), absPath, { status: "active" });
      expect(updated.status).toBe("active");
      expect(updated.body).toContain("status review→active");
      expect(updated.body.split("\n").filter((l) => l.includes("· note:")).length).toBe(0);
    } finally {
      clean();
    }
  });
});
