/**
 * `needs_merge` field round-trip (0069): parsed from frontmatter onto the Task,
 * written only when true (false is never persisted), and clearable through
 * `patchTaskFile` — the path the server uses to flip it on/off.
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig } from "../../core/types";
import { parseTask, serializeTask } from "../../core/task";
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
  const root = mkdtempSync(join(tmpdir(), "repoos-needs-merge-"));
  const work = join(root, "work");
  mkdirSync(work, { recursive: true });
  const absPath = join(work, "0069-drift.md");
  writeFileSync(absPath, content);
  return { root, absPath, clean: () => rmSync(root, { recursive: true, force: true }) };
}

function parse(content: string, absPath: string, root: string) {
  return parseTask({
    content,
    absPath,
    root,
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
  });
}

const PLAIN = `---
id: "0069"
title: Drifted branch
type: feature
status: review
---
## Problem

Body.
`;

const FLAGGED = `---
id: "0069"
title: Drifted branch
type: feature
status: review
needs_merge: true
---
## Problem

Body.
`;

describe("needs_merge frontmatter field", () => {
  it("parses needs_merge: true onto the Task as needsMerge", () => {
    const { root, absPath, clean } = setupFile(PLAIN);
    try {
      const t = parse(PLAIN, absPath, root);
      const flagged = parse(FLAGGED, absPath, root);
      expect(t.needsMerge).toBe(false);
      expect(flagged.needsMerge).toBe(true);
      expect(flagged.extra.needs_merge).toBeUndefined();
    } finally {
      clean();
    }
  });

  it("never writes needs_merge when unset or false", () => {
    const { root, absPath, clean } = setupFile(PLAIN);
    try {
      const t = parse(PLAIN, absPath, root);
      expect(serializeTask(t)).not.toContain("needs_merge");
    } finally {
      clean();
    }
  });

  it("clears the field (removes the key) when patched to false", () => {
    const { root, absPath, clean } = setupFile(FLAGGED);
    try {
      const cleared = patchTaskFile(config(root), absPath, { needsMerge: false });
      expect(cleared.needsMerge).toBe(false);
      expect(readFileSync(absPath, "utf8")).not.toContain("needs_merge:");
      expect(serializeTask(cleared)).not.toContain("needs_merge: true");
    } finally {
      clean();
    }
  });

  it("sets the flag through patchTaskFile and it round-trips", () => {
    const { root, absPath, clean } = setupFile(PLAIN);
    try {
      const flagged = patchTaskFile(config(root), absPath, { needsMerge: true });
      expect(flagged.needsMerge).toBe(true);
      expect(readFileSync(absPath, "utf8")).toContain("needs_merge: true");
    } finally {
      clean();
    }
  });
});
