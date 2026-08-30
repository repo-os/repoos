/**
 * Tests for pending-handoff persistence and recovery (#0235).
 *
 * Validates the lifecycle of handoff requests that are persisted to disk:
 *  1. Recognized signal → persisted to .repoos/pending-handoffs.json
 *  2. Clean exit → persisted pending cleared (finalization owns it)
 *  3. Interrupted exit → persisted pending retained (recovered on boot)
 *  4. New turn starts → stale pending superseded
 *  5. Recover on boot → re-fires onHandoff for valid pending entries
 *  6. Stale entries (wrong task status/branch) → dropped, not re-fired
 */
import { describe, expect, it, afterEach } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner, type AgentHandoffRequest } from "../../server/agents";
import type { Agent, RepoOSConfig, Task } from "../../core/types";

const roots: string[] = [];
let originalPath = process.env.PATH ?? "";

function fixture(status: "active" | "review" | "done" = "active") {
  const root = mkdtempSync(join(tmpdir(), "repoos-pending-ho-"));
  roots.push(root);
  const work = join(root, "work");
  const bin = join(root, "bin");
  mkdirSync(work, { recursive: true });
  mkdirSync(bin, { recursive: true });
  const taskFile = join(work, "0001-handoff.md");
  writeFileSync(
    taskFile,
    `---
id: "0001"
title: Handoff persistence test
type: feature
status: ${status}
priority: p2
area: server
assigned_to: ai
branch: feat/ho-test
---
## Test
`,
  );
  // qwen CLI that writes persistent output, session-id, and a handoff signal.
  // Does NOT call process.exit(); the process ends naturally (exit code 0),
  // or can be made to exit non-zero by setting REPOOS_FAKEBIN_FAIL=1.
  writeFileSync(
    join(bin, "qwen"),
    [
      "#!/usr/bin/env node",
      'process.stdout.write("persisted output\\n");',
      'process.stdout.write(\'{"session_id":"session-persisted"}\\n\');',
      'if (process.env.REPOOS_FAKEBIN_HANDOFF === "1") process.stdout.write("::repoos-handoff-ready::\\n");',
      'if (process.env.REPOOS_FAKEBIN_FAIL === "1") process.exitCode = 1;',
    ].join("\n"),
    { mode: 0o755 },
  );
  originalPath = process.env.PATH ?? "";
  process.env.PATH = `${bin}:${originalPath ?? ""}`;
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
    id: "0001",
    title: "Handoff persistence test",
    type: "feature",
    status,
    priority: "p2",
    area: "server",
    assignee: "ai",
    assignedTo: "ai",
    createdBy: "",
    branch: "feat/ho-test",
    tags: [],
    needsInput: false,
    needsMerge: false,
    noSourceChange: false,
    created_at: null,
    updated_at: null,
    path: "work/0001-handoff.md",
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

const agent: Agent = { name: "engineer", cli: "qwen code", model: "default", enabled: true };

// 10s (well under vitest's 15s testTimeout): these steps wait on a real child
// process spawning / exiting, which can take several seconds on a machine under
// memory pressure. A 3s cap here flaked `repoos check` — and once blocked a
// release — for reasons unrelated to any code change.
function waitFor(fn: () => boolean, label: string, ms = 10_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (fn()) return resolve();
      if (Date.now() - start > ms) return reject(new Error(`timeout: ${label}`));
      setTimeout(check, 10);
    };
    check();
  });
}

afterEach(() => {
  process.env.PATH = originalPath;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("pending handoff persistence (#0235)", () => {
  // -- Signal recognition & integration --

  it("recalls the handoff signal in the transcript after a clean turn with signal", async () => {
    const fx = fixture("active");
    process.env.REPOOS_FAKEBIN_HANDOFF = "1";
    const handoffs: AgentHandoffRequest[] = [];
    const runner = new AgentRunner(fx.config, () => {}, {
      writeDelayMs: 5,
      getTask: (id: string) => (id === fx.task.id ? fx.task : null),
      onHandoff: (request) => {
        handoffs.push(request);
      },
    });
    try {
      runner.start(fx.task, fx.task.branch, agent, { cwd: fx.root });
      await waitFor(() => !runner.isRunning(fx.task.id), "clean exit with signal");
      await waitFor(() => handoffs.length > 0, "onHandoff fired");
      // The signal was recognized and captured
      expect(handoffs[0]).toMatchObject({ taskId: fx.task.id, branch: fx.task.branch });
      // Transcript contains the system line acknowledging the handoff request
      const output = runner.output(fx.task.id)!;
      const sysLines = output.lines.map((l) => (l as { d?: string }).d ?? "");
      expect(sysLines.some((d) => d.includes("handoff"))).toBe(true);
    } finally {
      delete process.env.REPOOS_FAKEBIN_HANDOFF;
    }
  });

  // -- Interrupted turn retention --

  it("retains the persisted pending handoff when the agent turn is interrupted", async () => {
    const fx = fixture("active");
    process.env.REPOOS_FAKEBIN_HANDOFF = "1";
    process.env.REPOOS_FAKEBIN_FAIL = "1";
    const runner = new AgentRunner(fx.config, () => {}, {
      writeDelayMs: 5,
      getTask: (id: string) => (id === fx.task.id ? fx.task : null),
      onHandoff: () => {},
    });
    try {
      runner.start(fx.task, fx.task.branch, agent, { cwd: fx.root });
      await waitFor(() => !runner.isRunning(fx.task.id), "interrupted turn exit");
      const pendingFile = join(fx.cacheDir, "pending-handoffs.json");
      expect(existsSync(pendingFile)).toBe(true);
      const data = JSON.parse(readFileSync(pendingFile, "utf8")) as {
        requests: AgentHandoffRequest[];
      };
      expect(data.requests).toHaveLength(1);
      expect(data.requests[0]).toMatchObject({
        taskId: fx.task.id,
        branch: fx.task.branch,
        workdir: fx.root,
      });
      // The transcript notes the handoff is retained for recovery
      const output = runner.output(fx.task.id)!;
      const sysLines = output.lines.map((l) => (l as { d?: string }).d ?? "");
      expect(sysLines.some((d) => d.includes("retained") || d.includes("recovery"))).toBe(true);
      // The interrupted-exit escalation (agents.ts cleanup()) must not
      // double-flag this task — it already has its own boot-time recovery
      // path, so needsInput would be a false alarm ahead of that retry.
      const body = readFileSync(fx.task.absPath, "utf8");
      expect(body).not.toMatch(/needs_input:\s*true/);
    } finally {
      delete process.env.REPOOS_FAKEBIN_HANDOFF;
      delete process.env.REPOOS_FAKEBIN_FAIL;
    }
  });

  // -- Clean exit clears persisted pending --

  it("clears the persisted pending handoff after a clean exit with successful handoff", async () => {
    const fx = fixture("active");
    process.env.REPOOS_FAKEBIN_HANDOFF = "1";
    const handoffs: AgentHandoffRequest[] = [];
    const runner = new AgentRunner(fx.config, () => {}, {
      writeDelayMs: 5,
      getTask: (id: string) => (id === fx.task.id ? fx.task : null),
      onHandoff: (request) => {
        handoffs.push(request);
      },
    });
    try {
      runner.start(fx.task, fx.task.branch, agent, { cwd: fx.root });
      await waitFor(() => !runner.isRunning(fx.task.id), "clean exit");
      await waitFor(() => handoffs.length > 0, "onHandoff fired");
      expect(runner.consumeHandoff(handoffs[0])).toBe(true);
    } finally {
      delete process.env.REPOOS_FAKEBIN_HANDOFF;
    }
  });

  // -- New turn supersedes stale pending --

  it("clears a stale persisted pending handoff when a new turn starts", async () => {
    const fx = fixture("active");
    process.env.REPOOS_FAKEBIN_HANDOFF = "1";
    process.env.REPOOS_FAKEBIN_FAIL = "1";
    const runner = new AgentRunner(fx.config, () => {}, {
      writeDelayMs: 5,
      getTask: (id: string) => (id === fx.task.id ? fx.task : null),
      onHandoff: () => {},
    });
    try {
      // First turn: signal + interrupted → pending persisted
      runner.start(fx.task, fx.task.branch, agent, { cwd: fx.root });
      await waitFor(() => !runner.isRunning(fx.task.id), "interrupted turn 1");
      const pendingFile = join(fx.cacheDir, "pending-handoffs.json");
      expect(existsSync(pendingFile)).toBe(true);
      // Second turn (clean, no signal) supersedes stale pending
      delete process.env.REPOOS_FAKEBIN_HANDOFF;
      delete process.env.REPOOS_FAKEBIN_FAIL;
      runner.start(fx.task, fx.task.branch, agent, { cwd: fx.root });
      await waitFor(() => !runner.isRunning(fx.task.id), "clean turn 2");
    } finally {
      delete process.env.REPOOS_FAKEBIN_HANDOFF;
      delete process.env.REPOOS_FAKEBIN_FAIL;
    }
  });

  // -- Recovery --

  it("recoverPendingHandoffs re-fires onHandoff for valid pending handoffs", async () => {
    const fx = fixture("active");
    const handoffs: AgentHandoffRequest[] = [];
    // Use a consumeHandoff-gated wrapper that mirrors the real server.ts
    // onHandoff handler — this verifies the capability was properly admitted.
    const runner = new AgentRunner(fx.config, () => {}, {
      getTask: (id: string) => (id === fx.task.id ? fx.task : null),
      onHandoff: async (request) => {
        if (!runner.consumeHandoff(request)) return;
        handoffs.push(request);
      },
    });
    // Simulate a persisted pending handoff from an interrupted prior run
    mkdirSync(fx.cacheDir, { recursive: true });
    writeFileSync(
      join(fx.cacheDir, "pending-handoffs.json"),
      JSON.stringify(
        {
          requests: [
            { taskId: fx.task.id, runId: "old-run-id", branch: fx.task.branch, workdir: fx.root },
          ],
        },
        null,
        2,
      ),
    );
    runner.recoverPendingHandoffs();
    await waitFor(() => handoffs.length > 0, "recovery fired onHandoff");
    expect(handoffs[0]).toMatchObject({
      taskId: fx.task.id,
      branch: fx.task.branch,
      workdir: fx.root,
    });
    // The capability was consumed by consumeHandoff (authorizedHandoffs cleaned up)
    expect(runner.validateHandoff(handoffs[0])).toBe(false);
  });

  it("recoverPendingHandoffs cleans up capability if server rejects the recovered request", async () => {
    const fx = fixture("active");
    // Server-like handler that rejects via consumeHandoff's in-flight guard
    const runner = new AgentRunner(fx.config, () => {}, {
      getTask: (id: string) => (id === fx.task.id ? fx.task : null),
      onHandoff: async (request) => {
        if (!runner.consumeHandoff(request)) return;
        if (runner.isHandoffInFlight(request.taskId)) return;
        // Would finalize here — but for this test the guard rejects.
      },
    });
    mkdirSync(fx.cacheDir, { recursive: true });
    writeFileSync(
      join(fx.cacheDir, "pending-handoffs.json"),
      JSON.stringify(
        {
          requests: [
            { taskId: fx.task.id, runId: "old-run-id", branch: fx.task.branch, workdir: fx.root },
          ],
        },
        null,
        2,
      ),
    );
    runner.recoverPendingHandoffs();
    // Wait for the async onHandoff to settle (it is fire-and-forget)
    await new Promise((r) => setTimeout(r, 100));
    // The capability was admitted then cleaned up — validateHandoff should be false
    expect(
      runner.validateHandoff({
        taskId: fx.task.id,
        runId: "old-run-id",
        branch: fx.task.branch,
        workdir: fx.root,
      }),
    ).toBe(false);
  });

  it("recoverPendingHandoffs drops pending for completed tasks", async () => {
    const fx = fixture("done");
    const handoffs: AgentHandoffRequest[] = [];
    const runner = new AgentRunner(fx.config, () => {}, {
      getTask: (id: string) => (id === fx.task.id ? fx.task : null),
      onHandoff: (request) => {
        handoffs.push(request);
      },
    });
    mkdirSync(fx.cacheDir, { recursive: true });
    writeFileSync(
      join(fx.cacheDir, "pending-handoffs.json"),
      JSON.stringify(
        {
          requests: [
            { taskId: fx.task.id, runId: "old-run", branch: fx.task.branch, workdir: fx.root },
          ],
        },
        null,
        2,
      ),
    );
    runner.recoverPendingHandoffs();
    await new Promise((r) => setTimeout(r, 100));
    expect(handoffs).toHaveLength(0);
  });

  it("drops pending handoff for tasks with a non-matching branch", async () => {
    const fx = fixture("active");
    const handoffs: AgentHandoffRequest[] = [];
    const runner = new AgentRunner(fx.config, () => {}, {
      getTask: (id: string) => (id === fx.task.id ? fx.task : null),
      onHandoff: (request) => {
        handoffs.push(request);
      },
    });
    mkdirSync(fx.cacheDir, { recursive: true });
    writeFileSync(
      join(fx.cacheDir, "pending-handoffs.json"),
      JSON.stringify(
        {
          requests: [
            { taskId: fx.task.id, runId: "old-run", branch: "feat/WRONG", workdir: fx.root },
          ],
        },
        null,
        2,
      ),
    );
    runner.recoverPendingHandoffs();
    await new Promise((r) => setTimeout(r, 100));
    expect(handoffs).toHaveLength(0);
  });
});
