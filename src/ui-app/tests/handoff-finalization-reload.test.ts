/**
 * #0501 — handoff finalization must survive a server reload mid-check.
 */
import { describe, expect, it, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AgentRunner,
  HANDOFF_FINALIZATION_INTERRUPTED_DETAIL,
  handoffFinalizationWasInterrupted,
  isHandoffFinalizationProgressSysLine,
  type AgentHandoffRequest,
} from "../../server/agents";
import type { Agent, RepoOSConfig, Task } from "../../core/types";

const roots: string[] = [];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "repoos-ho-reload-"));
  roots.push(root);
  const work = join(root, "work");
  mkdirSync(work, { recursive: true });
  const taskFile = join(work, "0501-handoff.md");
  writeFileSync(
    taskFile,
    `---
id: "0501"
title: Reload handoff
type: bug
status: active
priority: p1
area: server
assigned_to: ai
branch: feat/ho-reload
---
## Test
`,
  );
  const config: RepoOSConfig = {
    root,
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
  };
  const task: Task = {
    id: "0501",
    title: "Reload handoff",
    type: "bug",
    status: "active",
    priority: "p1",
    area: "server",
    assignee: "ai",
    assignedTo: "ai",
    createdBy: "",
    branch: "feat/ho-reload",
    tags: [],
    needsInput: false,
    needsMerge: false,
    noSourceChange: false,
    created_at: null,
    updated_at: null,
    path: "work/0501-handoff.md",
    absPath: taskFile,
    body: "",
    extra: {},
    agentOverride: null,
    cliOverride: null,
    modelOverride: null,
    git: {
      branchExists: false,
      worktreeExists: false,
      lastCommit: null,
      lastCommitAt: null,
      worktreePath: null,
      dirty: false,
    },
  };
  return { root, config, task, cacheDir: join(root, ".repoos") };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("handoff finalization reload recovery (#0501)", () => {
  it("recoverPendingHandoffs leaves pending on disk until finalization completes", async () => {
    const fx = fixture();
    let release!: () => void;
    const block = new Promise<void>((resolve) => {
      release = resolve;
    });
    const handoffs: AgentHandoffRequest[] = [];
    const runner = new AgentRunner(fx.config, () => {}, {
      getTask: (id: string) => (id === fx.task.id ? fx.task : null),
      onHandoff: async (request) => {
        if (!runner.consumeHandoff(request)) return;
        handoffs.push(request);
        await block;
        runner.completeHandoffFinalization(request.taskId);
      },
    });
    mkdirSync(fx.cacheDir, { recursive: true });
    const pendingFile = join(fx.cacheDir, "pending-handoffs.json");
    writeFileSync(
      pendingFile,
      JSON.stringify({
        requests: [
          { taskId: fx.task.id, runId: "reload-run", branch: fx.task.branch, workdir: fx.root },
        ],
      }),
    );
    runner.recoverPendingHandoffs();
    await new Promise((r) => setTimeout(r, 50));
    expect(handoffs).toHaveLength(1);
    const mid = JSON.parse(readFileSync(pendingFile, "utf8")) as { requests: unknown[] };
    expect(mid.requests).toHaveLength(1);
    release();
    await new Promise((r) => setTimeout(r, 50));
    const after = JSON.parse(readFileSync(pendingFile, "utf8")) as { requests: unknown[] };
    expect(after.requests).toHaveLength(0);
  });

  it("detects interrupted finalization and progress-only sys lines", () => {
    expect(isHandoffFinalizationProgressSysLine("Server finalization: check")).toBe(true);
    expect(
      isHandoffFinalizationProgressSysLine("✗ Server finalization stopped at check: failed"),
    ).toBe(false);

    const interrupted = {
      lines: [
        { s: "sys", d: "Server finalization started — validating the runner handoff" },
        { s: "sys", d: "Server finalization: check" },
      ],
    };
    expect(handoffFinalizationWasInterrupted(interrupted as never)).toBe(true);

    const finished = {
      lines: [
        { s: "sys", d: "Server finalization started — validating the runner handoff" },
        { s: "sys", d: "✓ Server finalization complete — task moved to review" },
      ],
    };
    expect(handoffFinalizationWasInterrupted(finished as never)).toBe(false);
    expect(HANDOFF_FINALIZATION_INTERRUPTED_DETAIL).toMatch(/interrupted/);
  });
});
