import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig } from "../../core/types";
import { dismissNeedsInputOnTask } from "../../server/needs-input-dismiss";

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

const FLAGGED = `---
id: "0067"
title: Waiting on the human
type: feature
status: active
needs_input: true
needs_input_reason: review-failed
---
## Problem

Body.

## Activity

- 2026-09-26T00:00:00Z · created
`;

describe("dismissNeedsInputOnTask (#0511)", () => {
  it("clears needs_input and records who dismissed it", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-needs-dismiss-"));
    const work = join(root, "work");
    mkdirSync(work, { recursive: true });
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: root });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
    execFileSync("git", ["commit", "-q", "--allow-empty", "-m", "init"], { cwd: root });
    const absPath = join(work, "0067-waiting.md");
    writeFileSync(absPath, FLAGGED);
    try {
      const updated = dismissNeedsInputOnTask(config(root), absPath, "hello@repoos.org");
      expect(updated.needsInput).toBe(false);
      expect(updated.needsInputReason).toBeUndefined();
      const onDisk = readFileSync(absPath, "utf8");
      expect(onDisk).not.toContain("needs_input: true");
      expect(onDisk).toContain("needs_input dismissed by hello@repoos.org");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
