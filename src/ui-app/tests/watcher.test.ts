/**
 * WorkWatcher poll-based reconciliation (0157): fs.watch can drop events under
 * rapid filesystem activity, so WorkWatcher layers a 5s low-frequency poll to
 * catch missed content changes, new files, and deletions. This test verifies
 * that external file edits are picked up by the live index within the poll window.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig } from "../../core/types";
import { LiveIndex } from "../../server/live-index";
import { WorkWatcher } from "../../server/watcher";
import { waitFor, WAIT_FOR_POLL_MS } from "./helpers";

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

const TASK_CONTENT = `---
id: "0157"
title: Test task
type: feature
status: active
---
## Problem

Original content.
`;

const TASK_CONTENT_UPDATED = `---
id: "0157"
title: Test task
type: feature
status: active
---
## Problem

Updated content from external edit.
`;

describe("WorkWatcher poll-based reconciliation", () => {
  let root: string;
  let absPath: string;
  let cfg: RepoOSConfig;
  let index: LiveIndex;
  let watcher: WorkWatcher;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "repoos-watcher-"));
    const workDir = join(root, "work");
    mkdirSync(workDir, { recursive: true });
    absPath = join(workDir, "0157-test.md");
    writeFileSync(absPath, TASK_CONTENT);
    cfg = config(root);
    index = new LiveIndex(cfg);
    index.refreshAll();
    watcher = new WorkWatcher(cfg, index);
    watcher.start();
  });

  afterEach(() => {
    watcher.stop();
    rmSync(root, { recursive: true, force: true });
  });

  it("catches external file content changes within the poll window without fs.watch event", async () => {
    // Initial state: task is indexed
    let task = index.getTask("0157");
    expect(task).toBeDefined();
    expect(task?.body).toContain("Original content");

    // External edit: modify the file directly without notifying the watcher
    writeFileSync(absPath, TASK_CONTENT_UPDATED);

    // Wait for the poll cycle to pick up the change (default 5s, but we'll wait with a reasonable timeout)
    await waitFor(
      () => {
        const updated = index.getTask("0157");
        return updated ? updated.body.includes("Updated content") : false;
      },
      "file content change detected by reconciliation poll",
      6000, // Allow slightly more than one poll interval
    );

    task = index.getTask("0157");
    expect(task?.body).toContain("Updated content from external edit");
  });

  it("detects new files created externally", async () => {
    // Initial state
    let tasks = index.getTasks();
    const initialCount = tasks.length;

    // Create a new task file externally
    const newPath = join(root, "work", "0158-new.md");
    writeFileSync(
      newPath,
      `---
id: "0158"
title: Newly created task
type: bug
status: ready
---
## Problem

This was created externally.
`,
    );

    // Wait for poll to detect the new file
    await waitFor(
      () => {
        const t = index.getTask("0158");
        return t !== null;
      },
      "new file detected by reconciliation poll",
      6000,
    );

    tasks = index.getTasks();
    expect(tasks.length).toBe(initialCount + 1);
    const newTask = index.getTask("0158");
    expect(newTask).toBeDefined();
    expect(newTask?.title).toBe("Newly created task");
  });

  it("detects file deletions", async () => {
    // Initial state: task exists
    let task = index.getTask("0157");
    expect(task).toBeDefined();
    const initialCount = index.getTasks().length;

    // Delete the file externally
    rmSync(absPath, { force: true });

    // Wait for poll to detect the deletion
    await waitFor(
      () => {
        const deleted = index.getTask("0157");
        return deleted === null;
      },
      "file deletion detected by reconciliation poll",
      6000,
    );

    task = index.getTask("0157");
    expect(task).toBeNull();
    expect(index.getTasks().length).toBe(initialCount - 1);
  });
});
