/**
 * Tests that a non-clean agent exit flags the task for human attention
 * immediately, rather than leaving it silently `active` until TaskWatchdog's
 * staleness poll eventually notices — which wouldn't even catch a fast
 * crash-on-exit (e.g. an expired CLI OAuth session) since the process isn't
 * stalled, it's just done.
 *
 * Exclusions verified: a deliberate pause, and a turn that requested a
 * handoff but was interrupted before finalization — that shape already has
 * its own "retained for recovery" boot-time retry and must not be
 * double-flagged (see pending-handoff.test.ts).
 */
import { describe, expect, it, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../../server/agents";
import type { Agent, RepoOSConfig, Task } from "../../core/types";

const roots: string[] = [];
let originalPath = process.env.PATH ?? "";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "repoos-failed-exit-"));
  roots.push(root);
  const work = join(root, "work");
  const bin = join(root, "bin");
  mkdirSync(work, { recursive: true });
  mkdirSync(bin, { recursive: true });
  const taskFile = join(work, "0001-fail.md");
  writeFileSync(
    taskFile,
    `---
id: "0001"
title: Failed exit escalation test
type: feature
status: active
priority: p2
area: server
assigned_to: ai
branch: feat/fail-test
---
## Test
`,
  );
  // Fake qwen CLI: writes a stderr line, exits non-zero, never signals handoff.
  writeFileSync(
    join(bin, "qwen"),
    [
      "#!/usr/bin/env node",
      'process.stderr.write("Failed to authenticate: OAuth session expired\\n");',
      "process.exitCode = 1;",
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
    title: "Failed exit escalation test",
    type: "feature",
    status: "active",
    priority: "p2",
    area: "server",
    assignee: "ai",
    assignedTo: "ai",
    createdBy: "",
    branch: "feat/fail-test",
    tags: [],
    needsInput: false,
    needsMerge: false,
    noSourceChange: false,
    created_at: null,
    updated_at: null,
    path: "work/0001-fail.md",
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
  return { root, config, task, taskFile };
}

const agent: Agent = { name: "engineer", cli: "qwen code", model: "default", enabled: true };

function waitFor(fn: () => boolean, label: string, ms = 3000): Promise<void> {
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

describe("failed-exit escalation to needs_input", () => {
  it("flags the task and records the failure reason on a non-clean exit", async () => {
    const fx = fixture();
    const runner = new AgentRunner(fx.config, () => {}, {
      writeDelayMs: 5,
      getTask: (id: string) => (id === fx.task.id ? fx.task : null),
    });
    runner.start(fx.task, fx.task.branch, agent, { cwd: fx.root });
    await waitFor(() => !runner.isRunning(fx.task.id), "non-clean exit");
    // cleanup() writes synchronously on process close, but give the event
    // loop one more tick in case of a race with the "close" listener.
    await waitFor(() => readFileSync(fx.taskFile, "utf8").includes("needs_input"), "escalation written");
    const body = readFileSync(fx.taskFile, "utf8");
    expect(body).toMatch(/needs_input:\s*true/);
    expect(body).toContain("agent exited with an error");
    expect(body).toContain("OAuth session expired");
  });

  it("does not flag a task the human deliberately paused", async () => {
    const fx = fixture();
    const runner = new AgentRunner(fx.config, () => {}, {
      writeDelayMs: 5,
      getTask: (id: string) => (id === fx.task.id ? fx.task : null),
    });
    runner.start(fx.task, fx.task.branch, agent, { cwd: fx.root });
    runner.markPaused(fx.task.id);
    await waitFor(() => !runner.isRunning(fx.task.id), "non-clean exit while paused");
    await new Promise((r) => setTimeout(r, 100));
    const body = readFileSync(fx.taskFile, "utf8");
    expect(body).not.toMatch(/needs_input:\s*true/);
  });
});
