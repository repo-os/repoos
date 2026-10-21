/**
 * #0888 — a clean engineer turn that never requested a handoff must not leave
 * the task silently `active` forever.
 *
 * The policy is table-tested over exit kind × handoff state × queued messages ×
 * paused/human/review/closing-out, then exercised through the server-side
 * recovery entry point (resume below the cap, surface at it) and through the
 * real runner for the deferred-handoff delivery path.
 */
import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_ENGINEER_STALL_RESUME_LIMIT,
  DEFAULT_ENGINEER_STALL_RESUME_WINDOW_MS,
  ENGINEER_STALL_RESUME_LOG_KEY,
  countEngineerStallResumes,
  parseEngineerStallResumeLog,
  planEngineerStallResume,
  readEngineerCleanExitSignal,
  recordEngineerStallResume,
  serializeEngineerStallResumeLog,
  type EngineerStallResumeRecord,
  type EngineerStallPlanInput,
} from "../../core/engineer-crash-recovery";
import {
  recoverEngineerAfterStalledCleanExit,
  type EngineerStallRecoveryDeps,
} from "../../server/engineer-crash-recovery";
import { AgentRunner } from "../../server/agents";
import type { LiveIndex } from "../../server/live-index";
import type { Logger } from "../../core/logger";
import { parseTask } from "../../core/task";
import type { RepoOSConfig, Task } from "../../core/types";
import { waitFor } from "./helpers";

const NOW = Date.parse("2026-10-21T12:00:00Z");
const WINDOW = DEFAULT_ENGINEER_STALL_RESUME_WINDOW_MS;

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function resumeRecord(atMs: number): EngineerStallResumeRecord {
  return {
    at: new Date(atMs).toISOString(),
    reason: "clean-exit-without-handoff",
  };
}

function planInput(overrides: Partial<EngineerStallPlanInput> = {}): EngineerStallPlanInput {
  return {
    status: "active",
    isArchived: false,
    needsInput: false,
    assignedToHuman: false,
    paused: false,
    stoppedByPerson: false,
    running: false,
    handoffInFlight: false,
    pendingHandoff: false,
    closingOut: false,
    handoffRequested: false,
    exitKind: "clean",
    handoffDeferred: false,
    queuedMessages: 0,
    handoffSinceLastCommit: false,
    resumes: [],
    now: NOW,
    limit: DEFAULT_ENGINEER_STALL_RESUME_LIMIT,
    windowMs: WINDOW,
    ...overrides,
  };
}

function plan(overrides: Partial<EngineerStallPlanInput> = {}) {
  return planEngineerStallResume(planInput(overrides));
}

describe("stalled clean-exit policy (#0888)", () => {
  const cases: Array<{
    name: string;
    input: Partial<EngineerStallPlanInput>;
    expect: Record<string, unknown>;
  }> = [
    {
      name: "a clean exit without a handoff is resumed",
      input: {},
      expect: { action: "resume", reason: "clean-exit-without-handoff" },
    },
    {
      name: "a deferred handoff is always resumed to read the queued message",
      input: { handoffDeferred: true, queuedMessages: 2 },
      expect: { action: "resume", reason: "handoff-deferred", queuedMessages: 2 },
    },
    {
      name: "a deferred handoff for a human-assigned task is still not resumed",
      input: { handoffDeferred: true, queuedMessages: 2, assignedToHuman: true },
      expect: { action: "skip" },
    },
    {
      name: "a deferred handoff on a crashed turn is left to crash recovery",
      input: { handoffDeferred: true, queuedMessages: 2, exitKind: "crash" },
      expect: { action: "skip" },
    },
    {
      name: "a paused task with a deferred handoff is not resumed",
      input: { handoffDeferred: true, queuedMessages: 1, paused: true },
      expect: { action: "skip" },
    },
    {
      name: "a crashed turn belongs to crash recovery",
      input: { exitKind: "crash" },
      expect: { action: "skip" },
    },
    {
      name: "an unknown exit kind has no clean-exit evidence",
      input: { exitKind: "unknown" },
      expect: { action: "skip" },
    },
    {
      name: "a running turn is never resumed",
      input: { running: true },
      expect: { action: "skip" },
    },
    {
      name: "an in-flight handoff owns the task",
      input: { handoffInFlight: true },
      expect: { action: "skip" },
    },
    {
      name: "a pending handoff owns the task",
      input: { pendingHandoff: true },
      expect: { action: "skip" },
    },
    {
      name: "a paused task is never resumed",
      input: { paused: true },
      expect: { action: "skip" },
    },
    {
      name: "a stop by a person is never resumed",
      input: { stoppedByPerson: true },
      expect: { action: "skip" },
    },
    {
      name: "a task assigned to a human is never resumed",
      input: { assignedToHuman: true },
      expect: { action: "skip" },
    },
    {
      name: "a review task is never resumed",
      input: { status: "review" },
      expect: { action: "skip" },
    },
    {
      name: "a closing-out task is never resumed",
      input: { closingOut: true },
      expect: { action: "skip" },
    },
    {
      name: "a task already flagged for a human is not re-escalated",
      input: { needsInput: true },
      expect: { action: "skip" },
    },
    {
      name: "an engineer-requested handoff is not overridden",
      input: { handoffRequested: true },
      expect: { action: "skip" },
    },
    {
      name: "a handoff since the last commit means the work is done",
      input: { handoffSinceLastCommit: true },
      expect: { action: "skip" },
    },
    {
      name: "below the resume cap it resumes again",
      input: { resumes: [resumeRecord(NOW - 60_000), resumeRecord(NOW - 120_000)] },
      expect: { action: "resume", resumes: 2 },
    },
    {
      name: "at the resume cap it surfaces instead of looping",
      input: {
        resumes: [
          resumeRecord(NOW - 60_000),
          resumeRecord(NOW - 120_000),
          resumeRecord(NOW - 180_000),
        ],
      },
      expect: { action: "surface", reason: "resume-limit", resumes: 3 },
    },
    {
      name: "resumes outside the window do not count",
      input: {
        resumes: [
          resumeRecord(NOW - WINDOW - 60_000),
          resumeRecord(NOW - WINDOW - 120_000),
          resumeRecord(NOW - WINDOW - 180_000),
        ],
      },
      expect: { action: "resume", resumes: 0 },
    },
    {
      name: "an archived task is never resumed",
      input: { isArchived: true },
      expect: { action: "skip" },
    },
  ];

  it.each(cases)("$name", ({ input, expect: expected }) => {
    expect(plan(input)).toMatchObject(expected);
  });

  it("uses a 3-resume / 30-minute default budget", () => {
    expect(DEFAULT_ENGINEER_STALL_RESUME_LIMIT).toBe(3);
    expect(DEFAULT_ENGINEER_STALL_RESUME_WINDOW_MS).toBe(30 * 60 * 1000);
  });
});

describe("clean-exit activity signal (#0888)", () => {
  const transition = "- 2026-10-21T11:00:00Z · status ready→active";

  it("reads a clean-exit marker in the current active episode", () => {
    const body = `## Activity\n\n${transition}\n- 2026-10-21T11:10:00Z · engineer turn ended without a handoff: the turn exited cleanly\n`;
    expect(readEngineerCleanExitSignal(body)).toEqual({
      clean: true,
      deferred: 0,
      stoppedByPerson: false,
    });
  });

  it("ignores a marker from an earlier active episode", () => {
    const body = `## Activity\n\n- 2026-10-21T10:00:00Z · engineer turn ended without a handoff\n- 2026-10-21T11:00:00Z · status ready→active\n`;
    expect(readEngineerCleanExitSignal(body).clean).toBe(false);
  });

  it("does not treat a clean turn as clean when the latest line is a crash", () => {
    const body = `## Activity\n\n${transition}\n- 2026-10-21T11:10:00Z · engineer turn ended without a handoff\n- 2026-10-21T11:20:00Z · handoff failed · agent turn was interrupted\n`;
    expect(readEngineerCleanExitSignal(body).clean).toBe(false);
  });

  it("a later clean exit after a crash is resumable again", () => {
    const body = `## Activity\n\n${transition}\n- 2026-10-21T11:10:00Z · handoff failed · agent turn was interrupted\n- 2026-10-21T11:20:00Z · engineer turn ended without a handoff\n`;
    expect(readEngineerCleanExitSignal(body).clean).toBe(true);
  });

  it("a deferred handoff is itself proof of a clean turn and reports the queue size", () => {
    const body = `## Activity\n\n${transition}\n- 2026-10-21T11:10:00Z · handoff_deferred: 2 queued message(s) must be read before review\n`;
    expect(readEngineerCleanExitSignal(body)).toEqual({
      clean: true,
      deferred: 2,
      stoppedByPerson: false,
    });
  });

  it("a deliberate stop after a clean exit cancels the resume", () => {
    const body =
      `## Activity\n\n${transition}\n` +
      `- 2026-10-21T11:10:00Z · engineer turn ended without a handoff\n` +
      `- 2026-10-21T11:20:00Z · engineer stopped by request\n`;
    expect(readEngineerCleanExitSignal(body)).toEqual({
      clean: false,
      deferred: 0,
      stoppedByPerson: true,
    });
  });

  it("a deliberate stop after a deferred handoff cancels the resume", () => {
    const body =
      `## Activity\n\n${transition}\n` +
      `- 2026-10-21T11:10:00Z · handoff_deferred: 1 queued message(s) must be read before review\n` +
      `- 2026-10-21T11:20:00Z · engineer stopped by request\n`;
    expect(readEngineerCleanExitSignal(body)).toEqual({
      clean: false,
      deferred: 0,
      stoppedByPerson: true,
    });
  });

  it("a clean exit after a deliberate stop is resumable again", () => {
    const body =
      `## Activity\n\n${transition}\n` +
      `- 2026-10-21T11:10:00Z · engineer stopped by request\n` +
      `- 2026-10-21T11:20:00Z · engineer turn ended without a handoff\n`;
    expect(readEngineerCleanExitSignal(body)).toEqual({
      clean: true,
      deferred: 0,
      stoppedByPerson: false,
    });
  });

  it("a plain crash (not a handoff failure) is not a clean exit", () => {
    const body =
      `## Activity\n\n${transition}\n` +
      `- 2026-10-21T11:10:00Z · engineer turn ended without a handoff\n` +
      `- 2026-10-21T11:20:00Z · agent exited with an error · boom\n`;
    expect(readEngineerCleanExitSignal(body)).toEqual({
      clean: false,
      deferred: 0,
      stoppedByPerson: false,
    });
  });

  it("no activity at all is not a clean-exit signal", () => {
    expect(readEngineerCleanExitSignal("## Activity\n")).toEqual({
      clean: false,
      deferred: 0,
      stoppedByPerson: false,
    });
  });
});

describe("resume log (#0888)", () => {
  it("round-trips, prunes outside the window, and counts inside it", () => {
    let records: EngineerStallResumeRecord[] = [];
    records = recordEngineerStallResume(
      records,
      new Date(NOW - WINDOW - 120_000).toISOString(),
      "clean-exit-without-handoff",
      WINDOW,
    );
    records = recordEngineerStallResume(
      records,
      new Date(NOW - 60_000).toISOString(),
      "handoff-deferred",
      WINDOW,
    );
    const parsed = parseEngineerStallResumeLog(serializeEngineerStallResumeLog(records));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].reason).toBe("handoff-deferred");
    expect(countEngineerStallResumes(parsed, new Date(NOW).toISOString(), WINDOW)).toBe(1);
    expect(parseEngineerStallResumeLog("not json")).toEqual([]);
  });
});

const TASK_ID = "0888";

interface Fixture {
  root: string;
  taskPath: string;
  config: RepoOSConfig;
  task: () => Task;
}

function makeFixture(overrides: { assignedTo?: string; body?: string } = {}): Fixture {
  const root = mkdtempSync(join(tmpdir(), "repoos-0888-"));
  roots.push(root);
  const work = join(root, "work");
  mkdirSync(work, { recursive: true });
  const taskPath = join(work, `${TASK_ID}-stall.md`);
  writeFileSync(
    taskPath,
    `---
id: "${TASK_ID}"
title: Stalled clean exit
type: bug
status: active
priority: p1
area: server
assigned_to: ${overrides.assignedTo ?? "ai"}
branch: feat/0888-stall
---
## Problem
Stalled.

## Activity

- 2026-10-21T11:00:00Z · status ready→active
${overrides.body ?? ""}
`,
  );
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
  execFileSync("git", ["commit", "-qm", "initial"], { cwd: root });
  const config: RepoOSConfig = {
    root,
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
    maxConcurrentAgents: 2,
  };
  const task = (): Task =>
    parseTask({
      content: readFileSync(taskPath, "utf8"),
      absPath: taskPath,
      root,
      defaultStatus: config.defaultStatus,
      defaultAssignee: config.defaultAssignee,
    });
  return { root, taskPath, config, task };
}

function recoveryDeps(
  fx: Fixture,
  runnerState: Partial<
    Record<"isRunning" | "isPaused" | "isHandoffInFlight" | "hasPendingHandoff", boolean>
  > = {},
) {
  const launches: Array<{ instruction: string; task: Task }> = [];
  const deps: EngineerStallRecoveryDeps = {
    config: fx.config,
    index: {
      getTask: () => fx.task(),
      applyFileChange: () => {},
    } as unknown as LiveIndex,
    runner: {
      isRunning: () => runnerState.isRunning ?? false,
      isPaused: () => runnerState.isPaused ?? false,
      isHandoffInFlight: () => runnerState.isHandoffInFlight ?? false,
      hasPendingHandoff: () => runnerState.hasPendingHandoff ?? false,
    } as unknown as AgentRunner,
    logger: { task: () => {} } as unknown as Logger,
    launch: async (_deps, task, instruction) => {
      launches.push({ instruction, task });
      return { ok: true };
    },
  };
  return { deps, launches };
}

describe("recoverEngineerAfterStalledCleanExit (#0888)", () => {
  it("resumes with the resume preamble and records the attempt in Activity", async () => {
    const fx = makeFixture();
    const { deps, launches } = recoveryDeps(fx);

    const outcome = await recoverEngineerAfterStalledCleanExit(deps, TASK_ID, {
      exitKind: "clean",
    });

    expect(outcome.action).toBe("resumed");
    expect(launches).toHaveLength(1);
    expect(launches[0].instruction).toContain("ended cleanly without requesting a handoff");
    const onDisk = readFileSync(fx.taskPath, "utf8");
    expect(onDisk).toContain("engineer_stall_resume_log:");
    expect(onDisk).toContain(
      "watchdog: auto-resumed engineer after a clean exit without a handoff",
    );
    expect(fx.task().status).toBe("active");
    expect(fx.task().needsInput).toBe(false);
  });

  it("tells a deferred-handoff resume to read the queued message", async () => {
    const fx = makeFixture();
    const { deps, launches } = recoveryDeps(fx);

    const outcome = await recoverEngineerAfterStalledCleanExit(deps, TASK_ID, {
      exitKind: "clean",
      handoffDeferred: true,
      queuedMessages: 1,
    });

    expect(outcome.action).toBe("resumed");
    expect(launches[0].instruction).toContain("message(s) were still queued");
    expect(readFileSync(fx.taskPath, "utf8")).toContain(
      "watchdog: auto-resumed engineer to read a deferred handoff message",
    );
  });

  it("surfaces needs_input with the reason once the resume cap is reached", async () => {
    const fx = makeFixture();
    const realNow = Date.now();
    const seeded = serializeEngineerStallResumeLog([
      resumeRecord(realNow - 60_000),
      resumeRecord(realNow - 120_000),
      resumeRecord(realNow - 180_000),
    ]);
    // Persist the seeded log the way a previous resume would have.
    writeFileSync(
      fx.taskPath,
      readFileSync(fx.taskPath, "utf8").replace(
        "---\n## Problem",
        `${ENGINEER_STALL_RESUME_LOG_KEY}: '${seeded}'\n---\n## Problem`,
      ),
    );
    const { deps, launches } = recoveryDeps(fx);

    const outcome = await recoverEngineerAfterStalledCleanExit(deps, TASK_ID, {
      exitKind: "clean",
    });

    expect(outcome.action).toBe("surfaced");
    expect(launches).toHaveLength(0);
    const task = fx.task();
    expect(task.status).toBe("active");
    expect(task.needsInput).toBe(true);
    expect(task.needsInputReason).toBe("watchdog-stuck");
    expect(readFileSync(fx.taskPath, "utf8")).toContain("watchdog: escalated to needs_input");
  });

  it("never resumes a task assigned to a human", async () => {
    const fx = makeFixture({ assignedTo: "human" });
    const { deps, launches } = recoveryDeps(fx);
    const outcome = await recoverEngineerAfterStalledCleanExit(deps, TASK_ID, {
      exitKind: "clean",
    });
    expect(outcome.action).toBe("skipped");
    expect(launches).toHaveLength(0);
  });

  it("never resumes a paused task", async () => {
    const fx = makeFixture();
    const { deps, launches } = recoveryDeps(fx, { isPaused: true });
    const outcome = await recoverEngineerAfterStalledCleanExit(deps, TASK_ID, {
      exitKind: "clean",
    });
    expect(outcome.action).toBe("skipped");
    expect(launches).toHaveLength(0);
  });

  it("never resumes a task whose latest turn a person stopped", async () => {
    const fx = makeFixture({
      body:
        "- 2026-10-21T11:10:00Z · engineer turn ended without a handoff\n" +
        "- 2026-10-21T11:20:00Z · engineer stopped by request\n",
    });
    const { deps, launches } = recoveryDeps(fx);
    const outcome = await recoverEngineerAfterStalledCleanExit(deps, TASK_ID, {
      exitKind: "clean",
    });
    expect(outcome.action).toBe("skipped");
    expect(launches).toHaveLength(0);
  });

  it("never resumes a task that is being closed out", async () => {
    const fx = makeFixture();
    mkdirSync(join(fx.root, ".repoos", "locks"), { recursive: true });
    writeFileSync(
      join(fx.root, ".repoos", "locks", `${encodeURIComponent(TASK_ID)}.json`),
      JSON.stringify({ status: "closing-out", sha: "abc", at: new Date(NOW).toISOString() }),
    );
    const { deps, launches } = recoveryDeps(fx);
    const outcome = await recoverEngineerAfterStalledCleanExit(deps, TASK_ID, {
      exitKind: "clean",
    });
    expect(outcome.action).toBe("skipped");
    expect(launches).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Deferred-handoff delivery in the real runner (no crash recovery involved)
// ---------------------------------------------------------------------------

const FAKE_OPENCODE = `#!/usr/bin/env node
const fs = require("fs");
fs.appendFileSync(process.env.REPOOS_STALL_LOG, JSON.stringify({ args: process.argv.slice(2) }) + "\\n");
process.stdout.write("working\\n");
`;

describe("deferred handoff delivery (#0888)", () => {
  it("resumes the engineer to read a queued message on a CLEAN exit without crash recovery", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-0888-queue-"));
    roots.push(root);
    const bin = join(root, "bin");
    mkdirSync(bin, { recursive: true });
    mkdirSync(join(root, "work"), { recursive: true });
    writeFileSync(join(bin, "opencode"), FAKE_OPENCODE, { mode: 0o755 });
    const log = join(root, "spawns.log");
    const taskPath = join(root, "work", `${TASK_ID}-queue.md`);
    writeFileSync(
      taskPath,
      `---
id: "${TASK_ID}"
title: Queued message
type: bug
status: active
priority: p1
area: server
assigned_to: ai
branch: feat/0888-queue
---
## Problem
Queued.

## Activity

- 2026-10-21T11:00:00Z · status ready→active
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
      maxConcurrentAgents: 2,
    };
    const getTask = (): Task =>
      parseTask({
        content: readFileSync(taskPath, "utf8"),
        absPath: taskPath,
        root,
        defaultStatus: config.defaultStatus,
        defaultAssignee: config.defaultAssignee,
      });
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${bin}:${oldPath}`;
    process.env.REPOOS_STALL_LOG = log;
    const runner = new AgentRunner(config, () => {}, {
      getTask,
      onHandoff: () => {},
    });
    const agent = { name: "engineer", cli: "opencode", model: "default", enabled: true };
    try {
      const task = getTask();
      expect(runner.start(task, "feat/0888-queue", agent, { cwd: bin }).ok).toBe(true);
      expect(runner.send(TASK_ID, "read this before review", agent).queued).toBe(true);
      // The engineer asks for a handoff in the same turn the message was queued.
      const entry = runner["entries"].get(TASK_ID) as { handoffRequested?: boolean } | undefined;
      expect(entry).toBeDefined();
      entry!.handoffRequested = true;

      await waitFor(
        () => existsSync(log) && readFileSync(log, "utf8").trim().split("\n").length >= 2,
        "clean exit delivers the queued message in a resumed turn",
        8000,
      );
      const body = readFileSync(taskPath, "utf8");
      expect(body).toContain("handoff_deferred: 1 queued message(s) must be read before review");
      // The clean turn that ended without a handoff is durably marked for the
      // watchdog, and the resumed turn really read the queue.
      expect(body).toContain("engineer turn ended without a handoff");
      expect(body).toContain("message_delivered");
    } finally {
      runner.dispose();
      process.env.PATH = oldPath;
      delete process.env.REPOOS_STALL_LOG;
    }
  }, 30_000);
});
