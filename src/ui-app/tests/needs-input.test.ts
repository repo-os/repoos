/**
 * `needs_input` field round-trip (0067): parsed from frontmatter onto the Task,
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
  const root = mkdtempSync(join(tmpdir(), "repoos-needs-input-"));
  const work = join(root, "work");
  mkdirSync(work, { recursive: true });
  const absPath = join(work, "0067-waiting.md");
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
id: "0067"
title: Waiting on the human
type: feature
status: active
---
## Problem

Body.
`;

const FLAGGED = `---
id: "0067"
title: Waiting on the human
type: feature
status: active
needs_input: true
---
## Problem

Body.
`;

describe("needs_input frontmatter field", () => {
  it("parses needs_input: true onto the Task as needsInput", () => {
    const { root, absPath, clean } = setupFile(PLAIN);
    try {
      const t = parse(PLAIN, absPath, root);
      const flagged = parse(FLAGGED, absPath, root);
      expect(t.needsInput).toBe(false);
      expect(flagged.needsInput).toBe(true);
      expect(flagged.extra.needs_input).toBeUndefined();
    } finally {
      clean();
    }
  });

  it("never writes needs_input when unset or false", () => {
    const { root, absPath, clean } = setupFile(PLAIN);
    try {
      const t = parse(PLAIN, absPath, root);
      expect(serializeTask(t)).not.toContain("needs_input");
    } finally {
      clean();
    }
  });

  it("clears the field (removes the key) when patched to false", () => {
    const { root, absPath, clean } = setupFile(FLAGGED);
    try {
      const cleared = patchTaskFile(config(root), absPath, { needsInput: false });
      expect(cleared.needsInput).toBe(false);
      // The activity log may record the change, but the frontmatter key is gone.
      expect(readFileSync(absPath, "utf8")).not.toContain("needs_input:");
      expect(serializeTask(cleared)).not.toContain("needs_input: true");
    } finally {
      clean();
    }
  });

  it("sets the flag through patchTaskFile and it round-trips", () => {
    const { root, absPath, clean } = setupFile(PLAIN);
    try {
      const flagged = patchTaskFile(config(root), absPath, { needsInput: true });
      expect(flagged.needsInput).toBe(true);
      expect(readFileSync(absPath, "utf8")).toContain("needs_input: true");
    } finally {
      clean();
    }
  });
});
