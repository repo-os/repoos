import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig } from "../../core/types";
import { isHoldActive } from "../../core/task-selection.js";
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
      writeFileSync(
        join(work, "0223-board.md"),
        `---
id: "0223"
title: Board payload fixture
type: bug
status: active
priority: p1
area: web
---
${"x".repeat(650)}
`,
      );

      const index = new LiveIndex(config(root));
      index.refreshAll();
      const task = index.boardSnapshot().tasks[0];

      expect(task.bodyPreview).toHaveLength(500);
      expect(task).not.toHaveProperty("body");
      expect(task).not.toHaveProperty("activity");
      expect(task).not.toHaveProperty("extra");
      // Per-task agent overrides ARE carried (they're three short strings the
      // card's agent panel needs, #0455), unlike the heavy body/activity/extra.
      expect(task.agentOverride).toBeNull();
      expect(task.cliOverride).toBeNull();
      expect(task.modelOverride).toBeNull();
      expect(task.pmAgentOverride).toBeNull();
      expect(task.pmCliOverride).toBeNull();
      expect(task.pmModelOverride).toBeNull();
      expect(task.reviewAgentOverride).toBeNull();
      expect(task.reviewCliOverride).toBeNull();
      expect(task.reviewModelOverride).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("surfaces per-task agent overrides on the board payload (#0455)", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-board-overrides-"));
    try {
      const work = join(root, "work");
      mkdirSync(work, { recursive: true });
      writeFileSync(
        join(work, "0455-agents.md"),
        `---
id: "0455"
title: Agent overrides fixture
type: feature
status: ready
priority: p2
area: ui
agent_override: codex
cli_override: codex
model_override: gpt-5.6-luna
pm_agent_override: Ross
pm_cli_override: opencode
pm_model_override: opencode-go/nimo-v2.5
review_agent_override: reviewer-pro
review_cli_override: antigravity
review_model_override: gemini-3.8-flash-medium
---
`,
      );

      const index = new LiveIndex(config(root));
      index.refreshAll();
      const task = index.boardSnapshot().tasks[0];

      expect(task.agentOverride).toBe("codex");
      expect(task.cliOverride).toBe("codex");
      expect(task.modelOverride).toBe("gpt-5.6-luna");
      expect(task.pmAgentOverride).toBe("Ross");
      expect(task.pmCliOverride).toBe("opencode");
      expect(task.pmModelOverride).toBe("opencode-go/nimo-v2.5");
      expect(task.reviewAgentOverride).toBe("reviewer-pro");
      expect(task.reviewCliOverride).toBe("antigravity");
      expect(task.reviewModelOverride).toBe("gemini-3.8-flash-medium");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});


describe("hold metadata on the board contract", () => {
  it.each([
    { flag: true, tags: [], until: "2999-01-01T00:00:00Z", active: true },
    { flag: false, tags: ["hold"], until: "2999-01-01T00:00:00Z", active: true },
    { flag: true, tags: [], until: "2000-01-01T00:00:00Z", active: false },
    { flag: false, tags: ["hold"], until: "2000-01-01T00:00:00Z", active: false },
  ])("retains flag=$flag tags=$tags until=$until", ({ flag, tags, until, active }) => {
    const root = mkdtempSync(join(tmpdir(), "repoos-board-hold-"));
    try {
      mkdirSync(join(root, "work"));
      writeFileSync(join(root, "work/0960-held.md"), `---
id: "0960"
title: Held board fixture
status: active
hold: ${flag}
tags: ${JSON.stringify(tags)}
hold_reason: maintenance
hold_until: "${until}"
hold_by: driver
hold_at: "2026-10-27T00:00:00Z"
---
Body
`);
      const index = new LiveIndex(config(root));
      index.refreshAll();
      const board = JSON.parse(JSON.stringify(index.boardSnapshot()));
      expect(board.tasks[0]).toMatchObject({
        isHeld: flag, tags, holdReason: "maintenance", holdUntil: until,
        holdBy: "driver", holdAt: "2026-10-27T00:00:00Z",
      });
      expect(isHoldActive(board.tasks[0])).toBe(active);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
