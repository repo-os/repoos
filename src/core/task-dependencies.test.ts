import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseTask, serializeTask } from "./task.js";
import {
  normalizeTaskDependencies,
  parseTaskDependencies,
  taskDependencyBlockers,
  validateTaskDependencies,
} from "./task-dependencies.js";
import type { Task, Status } from "./types.js";
import type { RepoOSConfig } from "./types.js";
import { patchTaskFile } from "../server/write.js";
import { DependencyValidationError } from "./task-dependencies.js";

function task(
  root: string,
  id: string,
  status: Status,
  branch = "",
  dependsOn: string[] = [],
  mergedCommit?: string,
  body = "",
): Task {
  const absPath = join(root, "work", `${id}-task.md`);
  const content = [
    "---",
    `id: "${id}"`,
    `title: Task ${id}`,
    `status: ${status}`,
    `branch: ${branch}`,
    ...(dependsOn.length
      ? [`depends_on: [${dependsOn.map((value) => `"${value}"`).join(", ")}]`]
      : []),
    ...(mergedCommit ? [`merged_commit: ${mergedCommit}`] : []),
    "---",
    "",
    body,
  ].join("\n");
  return parseTask({
    content,
    absPath,
    root,
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
  });
}

function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function makeRepo(): { root: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-dependencies-"));
  mkdirSync(join(root, "work"));
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "user.name", "RepoOS test");
  writeFileSync(join(root, "base.txt"), "base\n");
  git(root, "add", "base.txt");
  git(root, "commit", "-m", "base");
  git(root, "checkout", "-q", "-b", "feature/upstream");
  writeFileSync(join(root, "upstream.txt"), "upstream\n");
  git(root, "add", "upstream.txt");
  git(root, "commit", "-m", "upstream");
  const mergedCommit = git(root, "rev-parse", "HEAD");
  git(root, "checkout", "-q", "main");
  return {
    root,
    clean: () => rmSync(root, { recursive: true, force: true }),
  };
}

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

describe("task dependency parsing and validation", () => {
  it("round-trips dependencies in canonical frontmatter order", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-dependency-format-"));
    try {
      const parsed = task(root, "0001", "ready", "", ["0002", "0003"]);
      expect(parsed.dependsOn).toEqual(["0002", "0003"]);
      const written = serializeTask(parsed);
      expect(written).toContain('depends_on: ["0002", "0003"]');
      expect(written.indexOf("story:")).toBe(-1);
      expect(written.indexOf("depends_on:")).toBeLessThan(written.indexOf("assigned_to:"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("tolerates object-form entries when reading future-compatible frontmatter", () => {
    expect(parseTaskDependencies([{ task_id: "0002" }, { id: "0003" }, "0004"])).toEqual([
      "0002",
      "0003",
      "0004",
    ]);
    expect(normalizeTaskDependencies("0002, 0003,0002")).toEqual(["0002", "0003"]);
  });

  it("rejects unknown ids, self-references, and cycles", () => {
    const root = "/repo";
    const a = task(root, "0001", "ready");
    const b = task(root, "0002", "ready", "", ["0001"]);
    expect(() => validateTaskDependencies("0001", ["9999"], [a, b])).toThrow(
      "Dependency task #9999 does not exist",
    );
    expect(() => validateTaskDependencies("0001", ["0001"], [a, b])).toThrow(
      "cannot depend on itself",
    );
    expect(() => validateTaskDependencies("0001", ["0002"], [a, b])).toThrow("cycle");
  });

  it("validates and persists dependencies through task-file writes", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-dependency-write-"));
    const work = join(root, "work");
    mkdirSync(work);
    const firstPath = join(work, "0001-first.md");
    const secondPath = join(work, "0002-second.md");
    const source = (id: string, dependsOn: string[] = []) =>
      [
        "---",
        `id: "${id}"`,
        `title: Task ${id}`,
        "type: feature",
        "status: ready",
        "priority: p2",
        'area: "general"',
        'assigned_to: ""',
        'created_by: ""',
        'branch: ""',
        ...(dependsOn.length
          ? [`depends_on: [${dependsOn.map((dependency) => `"${dependency}"`).join(", ")}]`]
          : []),
        "---",
        "",
      ].join("\n");
    writeFileSync(firstPath, source("0001"));
    writeFileSync(secondPath, source("0002"));
    try {
      const updated = patchTaskFile(config(root), firstPath, { dependsOn: ["0002"] });
      expect(updated.dependsOn).toEqual(["0002"]);
      expect(readFileSync(firstPath, "utf8")).toContain('depends_on: ["0002"]');
      expect(() => patchTaskFile(config(root), firstPath, { dependsOn: ["9999"] })).toThrow(
        DependencyValidationError,
      );
      expect(() => patchTaskFile(config(root), firstPath, { dependsOn: ["0001"] })).toThrow(
        DependencyValidationError,
      );
      expect(() => patchTaskFile(config(root), secondPath, { dependsOn: ["0001"] })).toThrow(
        "cycle",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("Git-verified task dependency state", () => {
  it("blocks unmerged and falsely-done upstream tasks, then unblocks after merge and branch cleanup", () => {
    const { root, clean } = makeRepo();
    try {
      const dependent = task(root, "0001", "ready", "", ["0002"]);
      const activeUpstream = task(root, "0002", "active", "feature/upstream");
      expect(taskDependencyBlockers(root, dependent, [dependent, activeUpstream])).toEqual([
        { id: "0002", state: "waiting" },
      ]);

      const falselyDone = task(root, "0002", "done", "feature/upstream");
      expect(taskDependencyBlockers(root, dependent, [dependent, falselyDone])).toEqual([
        { id: "0002", state: "waiting" },
      ]);

      git(root, "merge", "--ff-only", "feature/upstream");
      expect(taskDependencyBlockers(root, dependent, [dependent, falselyDone])).toEqual([]);

      git(root, "branch", "-D", "feature/upstream");
      const released = task(
        root,
        "0002",
        "done",
        "feature/upstream",
        [],
        git(root, "rev-parse", "HEAD"),
      );
      expect(taskDependencyBlockers(root, dependent, [dependent, released])).toEqual([]);
    } finally {
      clean();
    }
  });

  it("marks a removed or unprovable completed upstream as cancelled for human attention", () => {
    const { root, clean } = makeRepo();
    try {
      const dependent = task(root, "0001", "ready", "", ["0002", "0003"]);
      const completedWithoutProof = task(root, "0003", "done");
      const completedWithStaleProof = task(root, "0004", "done", "", [], "f".repeat(40));
      expect(taskDependencyBlockers(root, dependent, [dependent, completedWithoutProof])).toEqual([
        { id: "0002", state: "cancelled" },
        { id: "0003", state: "cancelled" },
      ]);
      expect(
        taskDependencyBlockers(root, dependent, [
          dependent,
          completedWithoutProof,
          completedWithStaleProof,
        ]),
      ).toEqual([
        { id: "0002", state: "cancelled" },
        { id: "0003", state: "cancelled" },
      ]);
      const dependentOnStaleProof = task(root, "0005", "ready", "", ["0004"]);
      expect(
        taskDependencyBlockers(root, dependentOnStaleProof, [
          dependentOnStaleProof,
          completedWithStaleProof,
        ]),
      ).toEqual([{ id: "0004", state: "cancelled" }]);
    } finally {
      clean();
    }
  });

  it("marks dependents of an explicitly abandoned upstream as needing a human", () => {
    const { root, clean } = makeRepo();
    try {
      const dependent = task(root, "0001", "ready", "", ["0002"]);
      const abandoned = task(
        root,
        "0002",
        "ready",
        "feature/upstream",
        [],
        undefined,
        [
          "## Activity",
          "",
          "- 2026-10-01T20:00:00Z · status active→ready",
          "- 2026-10-01T20:00:01Z · note: task abandoned",
        ].join("\n"),
      );
      expect(taskDependencyBlockers(root, dependent, [dependent, abandoned])).toEqual([
        { id: "0002", state: "cancelled" },
      ]);

      const restarted = task(
        root,
        "0002",
        "ready",
        "feature/upstream",
        [],
        undefined,
        `${abandoned.body}\n- 2026-10-01T20:01:00Z · status ready→active\n`,
      );
      expect(taskDependencyBlockers(root, dependent, [dependent, restarted])).toEqual([
        { id: "0002", state: "waiting" },
      ]);
    } finally {
      clean();
    }
  });
});
