/**
 * Per-task PM agent override fields round-trip (0186): parsed from frontmatter
 * onto the Task, written only when set, and settable/clearable through
 * `patchTaskFile` — the path the server uses to persist the PM tab's selector.
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
  const root = mkdtempSync(join(tmpdir(), "repoos-pm-override-"));
  const work = join(root, "work");
  mkdirSync(work, { recursive: true });
  const absPath = join(work, "0186-pm-tab.md");
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
id: "0186"
title: PM tab selector
type: feature
status: active
---
## Problem

Body.
`;

const PM_OVERRIDE = `---
id: "0186"
title: PM tab selector
type: feature
status: active
pm_agent_override: engineer
pm_cli_override: claude code
pm_model_override: sonnet
---
## Problem

Body.
`;

describe("per-task PM override frontmatter fields", () => {
  it("parses the pm_* keys onto the Task as pm overrides", () => {
    const { root, absPath, clean } = setupFile(PLAIN);
    try {
      const plain = parse(PLAIN, absPath, root);
      expect(plain.pmAgentOverride).toBeNull();
      expect(plain.pmCliOverride).toBeNull();
      expect(plain.pmModelOverride).toBeNull();
      expect(plain.extra.pm_agent_override).toBeUndefined();

      const overridden = parse(PM_OVERRIDE, absPath, root);
      expect(overridden.pmAgentOverride).toBe("engineer");
      expect(overridden.pmCliOverride).toBe("claude code");
      expect(overridden.pmModelOverride).toBe("sonnet");
    } finally {
      clean();
    }
  });

  it("never writes the pm_* keys when unset", () => {
    const { root, absPath, clean } = setupFile(PLAIN);
    try {
      const t = parse(PLAIN, absPath, root);
      const serialized = serializeTask(t);
      expect(serialized).not.toContain("pm_agent_override");
      expect(serialized).not.toContain("pm_cli_override");
      expect(serialized).not.toContain("pm_model_override");
    } finally {
      clean();
    }
  });

  it("sets the PM overrides through patchTaskFile and they round-trip", () => {
    const { root, absPath, clean } = setupFile(PLAIN);
    try {
      const patched = patchTaskFile(config(root), absPath, {
        pmAgentOverride: "engineer",
        pmCliOverride: "claude code",
        pmModelOverride: "sonnet",
      });
      expect(patched.pmAgentOverride).toBe("engineer");
      expect(patched.pmCliOverride).toBe("claude code");
      expect(patched.pmModelOverride).toBe("sonnet");
      const onDisk = readFileSync(absPath, "utf8");
      expect(onDisk).toContain("pm_agent_override: engineer");
      expect(onDisk).toContain("pm_cli_override: claude code");
      expect(onDisk).toContain("pm_model_override: sonnet");
    } finally {
      clean();
    }
  });

  it("clears the PM overrides (removes the keys) when patched to null", () => {
    const { root, absPath, clean } = setupFile(PM_OVERRIDE);
    try {
      const cleared = patchTaskFile(config(root), absPath, {
        pmAgentOverride: null,
        pmCliOverride: null,
        pmModelOverride: null,
      });
      expect(cleared.pmAgentOverride).toBeNull();
      expect(cleared.pmCliOverride).toBeNull();
      expect(cleared.pmModelOverride).toBeNull();
      const onDisk = readFileSync(absPath, "utf8");
      // The activity log records the change by key name, so match the actual
      // frontmatter entries (with the `:` separator) rather than the bare key.
      expect(onDisk).not.toContain("pm_agent_override:");
      expect(onDisk).not.toContain("pm_cli_override:");
      expect(onDisk).not.toContain("pm_model_override:");
    } finally {
      clean();
    }
  });
});
