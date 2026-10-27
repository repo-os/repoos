/**
 * #0960 round 3 — shared engineer-launch TOCTOU.
 *
 * `relaunchEngineerOnActiveTask` is the chokepoint for CTO recovery, the
 * watchdog, and `unhold --start`. Like the /start route, it must re-check the
 * hold after the awaited bootstrap work so a concurrent `repoos hold` cannot
 * slip through.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { relaunchEngineerOnActiveTask } from "../../server/engineer-launch.js";
import type { EngineerLaunchDeps } from "../../server/engineer-launch.js";
import { DEFAULT_CONFIG } from "../../core/config.js";
import type { RepoOSConfig, Task } from "../../core/types.js";

const bootstrapHoisted = vi.hoisted(() => ({ resolve: null as null | ((v: unknown) => void) }));
vi.mock("../../core/bootstrap.js", async (importActual) => ({
  ...(await importActual()),
  bootstrap: vi.fn(
    () =>
      new Promise((resolve) => {
        bootstrapHoisted.resolve = resolve;
      }),
  ),
}));
vi.mock("../../core/context-pack.js", async (importActual) => ({
  ...(await importActual()),
  generateContextPack: vi.fn(() => ({ content: "", cacheHit: false, generationMs: 1, size: 0 })),
  resumePreamble: vi.fn(() => undefined),
}));
vi.mock("../../core/git.js", async (importActual) => ({
  ...(await importActual()),
  ensureWorktree: vi.fn(() => ({ ok: true as const, path: "/tmp", created: false })),
}));
vi.mock("../../server/agents.js", async (importActual) => ({
  ...(await importActual()),
  resolveAgentForTask: vi.fn(() => ({ id: "eng", kind: "engineer" }) as never),
  pausedAgentFallbackNote: vi.fn(() => undefined),
}));

let roots: string[] = [];
afterEach(() => {
  for (const r of roots) {
    try {
      rmSync(r, { recursive: true, force: true });
    } catch {
      /* already gone */
    }
  }
  roots = [];
});

function activeTask(over: Partial<Task> & { id: string; absPath: string }): Task {
  return {
    title: "t",
    type: "feature",
    status: "active",
    needsInput: false,
    needsMerge: false,
    priority: "p2",
    area: "core",
    assignee: "ai",
    assignedTo: "ai",
    createdBy: "test",
    branch: "feat/x",
    tags: [],
    created_at: null,
    updated_at: null,
    body: "",
    isHeld: false,
    path: over.absPath,
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
    ...over,
  } as Task;
}

describe("relaunchEngineerOnActiveTask hold TOCTOU (#0960 round 3)", () => {
  it("refuses to spawn when a hold lands during bootstrap", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-hold-launch-toctou-"));
    roots.push(root);
    const workDir = join(root, "work");
    mkdirSync(workDir, { recursive: true });
    const absPath = join(workDir, "0003-toctou.md");
    writeFileSync(
      absPath,
      `---
id: "0003"
title: t
type: feature
status: active
priority: p2
area: core
assigned_to: ai
branch: feat/x
---
body
`,
    );
    const config: RepoOSConfig = { ...DEFAULT_CONFIG, root };
    const base = activeTask({ id: "0003", absPath, isHeld: false });
    let live: Task = base;
    const start = vi.fn(() => ({ ok: true as const, pid: 1, queued: false }));
    const launchDeps: EngineerLaunchDeps = {
      config,
      index: {
        refreshBranches: () => {},
        getTask: (tid: string) => (tid === "0003" ? live : undefined),
      } as never,
      runner: {
        releasePhantomForStart: () => {},
        isRunning: () => false,
        isPaused: () => false,
        isHandoffInFlight: () => false,
        hasPendingHandoff: () => false,
        start,
      } as never,
      logger: { task: () => {}, system: () => {}, agent: () => {} } as never,
    };

    const pending = relaunchEngineerOnActiveTask(launchDeps, base, "", {});
    live = {
      ...base,
      isHeld: true,
      holdReason: "concurrent hold during bootstrap",
    };
    bootstrapHoisted.resolve?.({
      ok: true,
      durationMs: 1,
      steps: [],
    });
    const result = await pending;

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/held/i);
      expect(result.reason).toContain("concurrent hold during bootstrap");
    }
    expect(start).not.toHaveBeenCalled();
  });
});
