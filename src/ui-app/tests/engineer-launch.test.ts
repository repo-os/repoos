/**
 * #0960 — the single engineer-start chokepoint must refuse a held task.
 *
 * `relaunchEngineerOnActiveTask` is shared by /start, the CTO monitor, the
 * watchdog and crash recovery, so a held task cannot be started by any of them.
 * Only `repoos start --force` (or a cleared hold via `repoos unhold`) may pass.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { relaunchEngineerOnActiveTask } from "../../server/engineer-launch.js";
import type { EngineerLaunchDeps } from "../../server/engineer-launch.js";
import { DEFAULT_CONFIG } from "../../core/config.js";
import type { RepoOSConfig, Task } from "../../core/types.js";

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
    holdReason: undefined,
    holdUntil: undefined,
    holdBy: undefined,
    holdAt: undefined,
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

function deps(config: RepoOSConfig): EngineerLaunchDeps {
  return {
    config,
    index: { refreshBranches: () => {} } as never,
    runner: {
      releasePhantomForStart: () => {},
      isRunning: () => false,
      isPaused: () => false,
      isHandoffInFlight: () => false,
      hasPendingHandoff: () => false,
      start: vi.fn(() => ({ ok: true as const, pid: 1, queued: false })),
    } as never,
    logger: { task: () => {}, system: () => {}, agent: () => {} } as never,
  };
}

describe("relaunchEngineerOnActiveTask hold guard (#0960)", () => {
  it("refuses a held task without --force", async () => {
    const result = await relaunchEngineerOnActiveTask(
      deps({ ...DEFAULT_CONFIG, root: "/tmp" }),
      activeTask({
        id: "0001",
        absPath: "/tmp/held-0001.md",
        isHeld: true,
        holdReason: "waiting on design sign-off",
        holdUntil: new Date(Date.now() + 60_000).toISOString(),
      }),
      "",
      {},
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/held/i);
      expect(result.reason).toContain("waiting on design sign-off");
      expect(result.reason).toContain("unhold");
    }
  });

  it("lets --force bypass the hold (so a human can start it)", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-hold-force-"));
    roots.push(root);
    const workDir = join(root, "work");
    mkdirSync(workDir, { recursive: true });
    const absPath = join(workDir, "0002-held.md");
    writeFileSync(
      absPath,
      `---
id: "0002"
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
    const heldForce = activeTask({
      id: "0002",
      absPath,
      isHeld: true,
      holdReason: "manual hold",
      holdUntil: new Date(Date.now() + 60_000).toISOString(),
    });
    const result = await relaunchEngineerOnActiveTask(deps(config), heldForce, "", { force: true });

    // Force must NOT return the hold refusal — it got past the #0960 guard. Once
    // past it, the launch proceeds (and may succeed or fail for other reasons);
    // either way, the hold-specific refusal is absent, proving the guard was
    // bypassed.
    if (!result.ok) {
      expect(result.reason).not.toMatch(/held/i);
    }
  });

  it("clears the hold's pause after hold_until expires so relaunch is not skipped", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-hold-expiry-"));
    roots.push(root);
    const workDir = join(root, "work");
    mkdirSync(workDir, { recursive: true });
    const absPath = join(workDir, "0004-expired.md");
    writeFileSync(
      absPath,
      `---
id: "0004"
title: t
type: feature
status: active
priority: p2
area: core
assigned_to: ai
branch: feat/x
hold: true
hold_reason: machine overload
hold_until: 2000-01-01T00:00:00Z
---
body
`,
    );
    const pauses = new Set(["0004"]);
    const holdPauses = new Set(["0004"]);
    const start = vi.fn(() => ({ ok: true as const, pid: 1, queued: false }));
    const config: RepoOSConfig = { ...DEFAULT_CONFIG, root };
    const launchDeps: EngineerLaunchDeps = {
      config,
      index: { refreshBranches: () => {}, getTask: () => undefined } as never,
      runner: {
        releasePhantomForStart: () => {},
        isRunning: () => false,
        isPaused: () => pauses.has("0004"),
        clearHoldPause: (id: string) => {
          if (holdPauses.delete(id)) pauses.delete(id);
        },
        isHandoffInFlight: () => false,
        hasPendingHandoff: () => false,
        start,
      } as never,
      logger: { task: () => {}, system: () => {}, agent: () => {} } as never,
    };
    const result = await relaunchEngineerOnActiveTask(
      launchDeps,
      activeTask({
        id: "0004",
        absPath,
        isHeld: true,
        holdReason: "machine overload",
        holdUntil: "2000-01-01T00:00:00Z",
      }),
      "",
      {},
    );
    expect(pauses.size).toBe(0);
    if (!result.ok) expect(result.reason).not.toMatch(/paused|held/i);
    else expect(start).toHaveBeenCalled();
  });
});
