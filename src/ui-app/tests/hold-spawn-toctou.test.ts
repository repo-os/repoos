/**
 * #0960 — the process is created in spawnTurn, which can run later than the
 * route's hold check (slot queue, pressure retry). A hold written to the task
 * file before that spawn must refuse, even when the Task object passed into
 * start() was captured earlier and is not held.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../../server/agents.js";
import { parseTask } from "../../core/task.js";
import { DEFAULT_CONFIG } from "../../core/config.js";
import type { Agent, RepoOSConfig } from "../../core/types.js";
import { clearExpiredHoldPauses } from "../../server/hold-guard.js";

const agent: Agent = { name: "engineer", cli: "qwen code", model: "default", enabled: true };

let roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function taskFile(held: boolean): string {
  return `---
id: "0007"
title: t
type: feature
status: active
priority: p2
area: core
assigned_to: ai
branch: feat/x
${held ? "hold: true\nhold_reason: landed during bootstrap\n" : ""}---
body
`;
}

describe("spawnTurn hold recheck (#0960)", () => {
  it("does not spawn when the task file is held, even if the start snapshot is not", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-hold-spawn-"));
    roots.push(root);
    const work = join(root, "work");
    mkdirSync(work, { recursive: true });
    const absPath = join(work, "0007-spawn.md");
    writeFileSync(absPath, taskFile(true));
    const config: RepoOSConfig = { ...DEFAULT_CONFIG, root };
    const read = () =>
      parseTask({
        content: readFileSync(absPath, "utf8"),
        absPath,
        root,
        defaultStatus: "inbox",
        defaultAssignee: "unassigned",
      });
    const runner = new AgentRunner(config, () => {}, { getTask: () => read() });
    const stale = read();
    stale.isHeld = false;
    stale.holdReason = undefined;
    const result = runner.start(stale, "feat/x", agent, { cwd: root });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/landed during bootstrap/);
    expect(runner.isRunning("0007")).toBe(false);
  });
});

describe("clearExpiredHoldPauses (#0960)", () => {
  it("clears a hold pause only after hold_until has passed", () => {
    const cleared: string[] = [];
    const runner = { clearHoldPause: (id: string) => cleared.push(id) };
    const base = {
      title: "t",
      type: "feature" as const,
      status: "active" as const,
      needsInput: false,
      needsMerge: false,
      priority: "p2" as const,
      area: "core",
      assignee: "ai" as const,
      assignedTo: "ai" as const,
      createdBy: "t",
      branch: "feat/x",
      tags: [],
      created_at: null,
      updated_at: null,
      body: "",
      path: "work/0008.md",
      absPath: "/tmp/0008.md",
      extra: {},
      agentOverride: null,
      cliOverride: null,
      modelOverride: null,
      git: {
        branchExists: true,
        worktreeExists: false,
        lastCommit: null,
        lastCommitAt: null,
        worktreePath: null,
        dirty: false,
      },
    };
    clearExpiredHoldPauses(
      [
        {
          ...base,
          id: "future",
          isHeld: true,
          holdUntil: "2999-01-01T00:00:00Z",
        } as never,
        {
          ...base,
          id: "expired",
          isHeld: true,
          holdUntil: "2000-01-01T00:00:00Z",
        } as never,
        { ...base, id: "open", isHeld: false } as never,
      ],
      runner,
    );
    expect(cleared).toEqual(["expired"]);
  });
});
