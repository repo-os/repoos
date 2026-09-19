/**
 * Per-task reviewer agent override fields round-trip (0287): parsed from
 * frontmatter onto the Task, written only when set, and settable/clearable
 * through `patchTaskFile` — the path the server uses to persist the Review
 * tab's selector.
 */
import { describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Agent, RepoOSConfig, Task } from "../../core/types";
import { parseTask, serializeTask } from "../../core/task";
import { ReviewManager } from "../../server/review";
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
  const root = mkdtempSync(join(tmpdir(), "repoos-review-override-"));
  const work = join(root, "work");
  mkdirSync(work, { recursive: true });
  const absPath = join(work, "0287-review-tab.md");
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
id: "0287"
title: Reviewer tab selector
type: feature
status: active
---
## Problem

Body.
`;

const REVIEW_OVERRIDE = `---
id: "0287"
title: Reviewer tab selector
type: feature
status: active
review_agent_override: codex
review_cli_override: codex
review_model_override: gpt-5
---
## Problem

Body.
`;

describe("per-task reviewer override frontmatter fields", () => {
  it("parses the review_* keys onto the Task as reviewer overrides", () => {
    const { root, absPath, clean } = setupFile(PLAIN);
    try {
      const plain = parse(PLAIN, absPath, root);
      expect(plain.reviewAgentOverride).toBeNull();
      expect(plain.reviewCliOverride).toBeNull();
      expect(plain.reviewModelOverride).toBeNull();
      expect(plain.extra.review_agent_override).toBeUndefined();

      const overridden = parse(REVIEW_OVERRIDE, absPath, root);
      expect(overridden.reviewAgentOverride).toBe("codex");
      expect(overridden.reviewCliOverride).toBe("codex");
      expect(overridden.reviewModelOverride).toBe("gpt-5");
    } finally {
      clean();
    }
  });

  it("never writes the review_* keys when unset", () => {
    const { root, absPath, clean } = setupFile(PLAIN);
    try {
      const t = parse(PLAIN, absPath, root);
      const serialized = serializeTask(t);
      expect(serialized).not.toContain("review_agent_override");
      expect(serialized).not.toContain("review_cli_override");
      expect(serialized).not.toContain("review_model_override");
    } finally {
      clean();
    }
  });

  it("sets the reviewer overrides through patchTaskFile and they round-trip", () => {
    const { root, absPath, clean } = setupFile(PLAIN);
    try {
      const patched = patchTaskFile(config(root), absPath, {
        reviewAgentOverride: "codex",
        reviewCliOverride: "codex",
        reviewModelOverride: "gpt-5",
      });
      expect(patched.reviewAgentOverride).toBe("codex");
      expect(patched.reviewCliOverride).toBe("codex");
      expect(patched.reviewModelOverride).toBe("gpt-5");
      const onDisk = readFileSync(absPath, "utf8");
      expect(onDisk).toContain("review_agent_override: codex");
      expect(onDisk).toContain("review_cli_override: codex");
      expect(onDisk).toContain("review_model_override: gpt-5");
    } finally {
      clean();
    }
  });

  it("clears the reviewer overrides (removes the keys) when patched to null", () => {
    const { root, absPath, clean } = setupFile(REVIEW_OVERRIDE);
    try {
      const cleared = patchTaskFile(config(root), absPath, {
        reviewAgentOverride: null,
        reviewCliOverride: null,
        reviewModelOverride: null,
      });
      expect(cleared.reviewAgentOverride).toBeNull();
      expect(cleared.reviewCliOverride).toBeNull();
      expect(cleared.reviewModelOverride).toBeNull();
      const onDisk = readFileSync(absPath, "utf8");
      // The activity log records the change by key name, so match the actual
      // frontmatter entries (with the `:` separator) rather than the bare key.
      expect(onDisk).not.toContain("review_agent_override:");
      expect(onDisk).not.toContain("review_cli_override:");
      expect(onDisk).not.toContain("review_model_override:");
    } finally {
      clean();
    }
  });
});

describe("review completion", () => {
  it("reports the reviewer selected for the turn, not the global default", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-review-selected-agent-"));
    try {
      const cfg: RepoOSConfig = {
        ...config(root),
        agents: [{ name: "reviewer", cli: "opencode", model: "default", enabled: true }],
      } as RepoOSConfig;
      const selected: Agent = {
        name: "reviewer",
        cli: "antigravity",
        model: "gemini-3.8-flash-medium",
        enabled: true,
      };
      const task = {
        id: "0287",
        title: "Reviewer tab selector",
        status: "review",
        branch: "feat/review-agent",
        absPath: join(root, "work", "0287-review-tab.md"),
        path: "work/0287-review-tab.md",
      } as Task;
      const runner = {
        output: () => ({ lines: [], accumulatedMs: 0 }),
      };
      const reviews = new ReviewManager(
        cfg,
        () => {},
        runner as never,
        {
          getTask: () => task,
        } as never,
      );
      const finalize = vi.spyOn(reviews as any, "finalizeRun").mockImplementation(() => undefined);

      // A review turn was started with a task-level Antigravity override.
      // Completion must not silently label its result as the global OpenCode
      // reviewer.
      (reviews as any).runs.set(task.id, { cancelled: false, mode: "run", agent: selected });
      reviews.handleReviewDone(`review:${task.id}`, true, "run");

      expect(finalize).toHaveBeenCalledWith(task, selected, [], expect.anything(), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
