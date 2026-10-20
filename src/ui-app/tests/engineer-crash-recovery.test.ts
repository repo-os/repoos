/**
 * #0869 — crashes must not become handoffs, and recovery is bounded.
 *
 * Table-driven policy tests (threshold/window, paused pairs, human overrides,
 * repeated crashes) plus runner-level tests for the two shapes that caused the
 * incident: an error exit with no handoff signal (never a handoff, flag clears
 * on the next run) and an error exit that DID carry the engineer's own signal
 * (finalizes normally).
 */
import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ENGINEER_FAILOVER_KEY,
  countEngineerCrashes,
  failoverBlock,
  failoverMarker,
  nextFailoverPair,
  parseEngineerCrashLog,
  planEngineerCrashRecovery,
  recordEngineerCrash,
  serializeEngineerCrashLog,
  type EngineerCrashRecord,
  type EngineerPair,
} from "../../core/engineer-crash-recovery";
import { AgentRunner, HANDOFF_READY_SIGNAL } from "../../server/agents";
import {
  recoverEngineerAfterCrash,
  clearEngineerCrashRecoveryState,
} from "../../server/engineer-crash-recovery";
import type { LiveIndex } from "../../server/live-index";
import type { Logger } from "../../core/logger";
import { parseTask } from "../../core/task";
import type { Agent, AgentModelAllowRow, RepoOSConfig, Task } from "../../core/types";
import { waitFor } from "./helpers";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const NOW = Date.parse("2026-10-20T12:00:00Z");
const PAIR: EngineerPair = { cli: "codex", model: "gpt-5" };
const THRESHOLD = 3;
const WINDOW = 30 * 60 * 1000;

function planTask(
  overrides: Partial<Pick<Task, "agentOverride" | "cliOverride" | "modelOverride">> = {},
  extra: Record<string, unknown> = {},
): Pick<Task, "agentOverride" | "cliOverride" | "modelOverride" | "extra"> {
  return {
    agentOverride: null,
    cliOverride: null,
    modelOverride: null,
    extra,
    ...overrides,
  };
}

function recordsFor(pair: EngineerPair, count: number, atMs = NOW): EngineerCrashRecord[] {
  let records: EngineerCrashRecord[] = [];
  for (let i = 0; i < count; i++) {
    records = recordEngineerCrash(
      records,
      pair,
      "dev-error",
      new Date(atMs - i * 1000).toISOString(),
      WINDOW,
    );
  }
  return records;
}

function plan(
  overrides: {
    task?: ReturnType<typeof planTask>;
    pair?: EngineerPair;
    crashes?: EngineerCrashRecord[];
    allowlist?: AgentModelAllowRow[];
    now?: number;
    handoffRequested?: boolean;
  } = {},
) {
  return planEngineerCrashRecovery({
    task: overrides.task ?? planTask(),
    pair: overrides.pair ?? PAIR,
    crashes: overrides.crashes ?? [],
    threshold: THRESHOLD,
    windowMs: WINDOW,
    now: overrides.now ?? NOW,
    allowlist: overrides.allowlist ?? [
      { cli: "codex", models: ["gpt-5"] },
      { cli: "opencode", models: ["big-pickle"] },
    ],
    handoffRequested: overrides.handoffRequested,
  });
}

describe("engineer crash recovery policy (#0869)", () => {
  const cases: Array<{
    name: string;
    input: Parameters<typeof plan>[0];
    expect: Record<string, unknown>;
  }> = [
    {
      name: "an engineer-requested handoff always wins",
      input: { handoffRequested: true, crashes: recordsFor(PAIR, 5) },
      expect: { action: "handoff" },
    },
    {
      name: "below the threshold the same pair is resumed",
      input: { crashes: recordsFor(PAIR, THRESHOLD - 1) },
      expect: { action: "resume", pair: PAIR, crashes: 2 },
    },
    {
      name: "at the threshold the next unpaused allowlist pair is chosen",
      input: { crashes: recordsFor(PAIR, THRESHOLD) },
      expect: { action: "failover", from: PAIR, to: { cli: "opencode", model: "big-pickle" } },
    },
    {
      name: "crashes outside the window do not count",
      input: { crashes: recordsFor(PAIR, THRESHOLD, NOW - WINDOW - 60_000) },
      expect: { action: "resume", crashes: 0 },
    },
    {
      name: "another pair's crashes do not count against this one",
      input: { crashes: recordsFor({ cli: "opencode", model: "big-pickle" }, THRESHOLD) },
      expect: { action: "resume", crashes: 0 },
    },
    {
      name: "a paused alternative is never selected",
      input: {
        crashes: recordsFor(PAIR, THRESHOLD),
        allowlist: [
          { cli: "codex", models: ["gpt-5"] },
          { cli: "claude code", models: ["opus"], paused: true },
          { cli: "cursor", models: ["composer"], paused: true },
        ],
      },
      expect: { action: "surface", reason: "no-allowed-pair" },
    },
    {
      name: "a human agent override is surfaced, never replaced",
      input: {
        task: planTask({ agentOverride: "my-engineer" }),
        crashes: recordsFor(PAIR, THRESHOLD),
      },
      expect: { action: "surface", reason: "human-override" },
    },
    {
      name: "a human CLI override is surfaced, never replaced",
      input: {
        task: planTask({ cliOverride: "codex", modelOverride: "gpt-5" }),
        crashes: recordsFor(PAIR, THRESHOLD),
      },
      expect: { action: "surface", reason: "human-override" },
    },
    {
      name: "a previous automatic switch is not chained",
      input: {
        task: planTask(
          { cliOverride: "opencode", modelOverride: "big-pickle" },
          { [ENGINEER_FAILOVER_KEY]: failoverMarker({ cli: "opencode", model: "big-pickle" }) },
        ),
        pair: { cli: "opencode", model: "big-pickle" },
        crashes: recordsFor({ cli: "opencode", model: "big-pickle" }, THRESHOLD),
      },
      expect: { action: "surface", reason: "already-failed-over" },
    },
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      expect(plan(testCase.input)).toMatchObject(testCase.expect);
    });
  }

  it("a human edit after an automatic switch is treated as a human override", () => {
    const task = planTask(
      { cliOverride: "cursor", modelOverride: "composer" },
      { [ENGINEER_FAILOVER_KEY]: failoverMarker({ cli: "opencode", model: "big-pickle" }) },
    );
    expect(failoverBlock(task, { cli: "cursor", model: "composer" })).toMatchObject({
      kind: "human-override",
    });
  });

  it("nextFailoverPair skips paused claude/cursor rows and the failing pair", () => {
    const rows: AgentModelAllowRow[] = [
      { cli: "codex", models: ["gpt-5"] },
      { cli: "claude code", models: ["opus"], paused: true },
      { cli: "cursor", models: ["composer"], paused: true },
      { cli: "opencode", models: ["big-pickle"] },
    ];
    expect(nextFailoverPair(rows, PAIR, NOW)).toEqual({
      cli: "opencode",
      model: "big-pickle",
    });
    const onlyFailingPlusPaused: AgentModelAllowRow[] = [
      { cli: "codex", models: ["gpt-5"] },
      { cli: "claude code", models: ["opus"], paused: true },
      { cli: "cursor", models: ["composer"], paused: true },
    ];
    expect(nextFailoverPair(onlyFailingPlusPaused, PAIR, NOW)).toBeNull();
  });

  it("counts, prunes and round-trips the persisted crash log", () => {
    const records = recordEngineerCrash([], PAIR, "dev-error", new Date(NOW).toISOString(), WINDOW);
    const parsed = parseEngineerCrashLog(serializeEngineerCrashLog(records));
    expect(parsed).toHaveLength(1);
    expect(countEngineerCrashes(parsed, PAIR, new Date(NOW).toISOString(), WINDOW)).toBe(1);
    expect(parseEngineerCrashLog("not json")).toEqual([]);
  });
});

/** Minimal git fixture so the real AgentRunner can spawn a fake CLI. */
function runnerFixture(script: string) {
  const root = mkdtempSync(join(tmpdir(), "repoos-0869-"));
  roots.push(root);
  const work = join(root, "work");
  const bin = join(root, "bin");
  mkdirSync(work, { recursive: true });
  mkdirSync(bin, { recursive: true });
  const taskPath = join(work, "0869-crash.md");
  writeFileSync(
    taskPath,
    `---
id: "0869"
title: Crash recovery
type: bug
status: active
priority: p1
area: server
assigned_to: ai
branch: feat/0869-crash
---
## Problem
Crash.
`,
  );
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
  execFileSync("git", ["commit", "-qm", "initial"], { cwd: root });
  writeFileSync(join(bin, "opencode"), script, { mode: 0o755 });
  const previousPath = process.env.PATH;
  process.env.PATH = `${bin}:${previousPath ?? ""}`;
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
  const task = parseTask({
    content: readFileSync(taskPath, "utf8"),
    absPath: taskPath,
    root,
    defaultStatus: config.defaultStatus,
    defaultAssignee: config.defaultAssignee,
  });
  const agent: Agent = {
    name: "engineer",
    cli: "opencode",
    model: "test-model",
    instructions: "",
    enabled: true,
  };
  return {
    root,
    task,
    taskPath,
    config,
    agent,
    restorePath: () => {
      process.env.PATH = previousPath;
    },
  };
}

const CRASH_SCRIPT = `#!/usr/bin/env node
process.stdout.write("working\\n");
process.stderr.write("boom: reading additional input from stdin\\n");
process.exit(1);
`;

const CRASH_WITH_SIGNAL_SCRIPT = `#!/usr/bin/env node
process.stdout.write("working\\n");
process.stdout.write("${HANDOFF_READY_SIGNAL}\\n");
process.exit(1);
`;

const CLEAN_SCRIPT = `#!/usr/bin/env node
process.stdout.write("working\\n");
process.exit(0);
`;

describe("applying crash recovery to a task (#0869)", () => {
  function recoveryDeps(fx: ReturnType<typeof runnerFixture>) {
    const launches: Array<{
      instruction: string;
      opts: { freshSession?: boolean; fromCrashRecovery?: boolean };
    }> = [];
    const deps = {
      config: fx.config,
      index: {
        getTask: () => fx.task,
        applyFileChange: () => {},
      } as unknown as LiveIndex,
      runner: {
        isRunning: () => false,
        isHandoffInFlight: () => false,
        hasPendingHandoff: () => false,
        isPaused: () => false,
      } as unknown as AgentRunner,
      logger: { task: () => {} } as unknown as Logger,
      launch: async (
        _deps: unknown,
        _task: unknown,
        instruction: string,
        opts?: { freshSession?: boolean; fromCrashRecovery?: boolean },
      ) => {
        launches.push({ instruction, opts: opts ?? {} });
        return { ok: true as const };
      },
    };
    return { deps, launches };
  }

  it("resumes twice, then fails over to the next unpaused allowlist pair and records it", async () => {
    const fx = runnerFixture(CLEAN_SCRIPT);
    try {
      fx.config.budget = {
        allowlist: [
          { cli: "codex", models: ["gpt-5"] },
          { cli: "claude code", models: ["opus"], paused: true },
          { cli: "cursor", models: ["composer"], paused: true },
          { cli: "opencode", models: ["big-pickle"] },
        ],
      };
      fx.config.watchdog = { engineerCrashFailoverThreshold: 3 };
      const { deps, launches } = recoveryDeps(fx);
      const info = {
        cli: "codex",
        model: "gpt-5",
        kind: "dev-error",
        reason: "Reading additional input from stdin",
      };
      const base = Date.parse("2026-10-20T12:00:00Z");
      const actions: string[] = [];
      for (let i = 0; i < 3; i++) {
        const outcome = await recoverEngineerAfterCrash(deps, "0869", info, {
          now: base + i * 1000,
        });
        actions.push(outcome.action);
      }
      expect(actions).toEqual(["resumed", "resumed", "failed-over"]);
      expect(launches).toHaveLength(3);
      expect(launches[2].opts.freshSession).toBe(true);
      expect(launches[2].instruction).toContain(
        "RepoOS switched this task to opencode + big-pickle",
      );
      const onDisk = readFileSync(fx.taskPath, "utf8");
      expect(onDisk).toContain("cli_override: opencode");
      expect(onDisk).toContain("model_override: big-pickle");
      expect(onDisk).toContain("engineer_failover:");
      expect(onDisk).toMatch(
        /engineer crash recovery: switched codex \+ gpt-5 → opencode \+ big-pickle/,
      );
    } finally {
      fx.restorePath();
    }
  });

  it("clears the crash window on progress but keeps the automatic pair", async () => {
    const fx = runnerFixture(CLEAN_SCRIPT);
    try {
      fx.config.budget = {
        allowlist: [
          { cli: "codex", models: ["gpt-5"] },
          { cli: "opencode", models: ["big-pickle"] },
        ],
      };
      fx.config.watchdog = { engineerCrashFailoverThreshold: 1 };
      const { deps } = recoveryDeps(fx);
      await recoverEngineerAfterCrash(
        deps,
        "0869",
        { cli: "codex", model: "gpt-5", kind: "dev-error", reason: "boom" },
        { now: Date.parse("2026-10-20T12:00:00Z") },
      );
      expect(readFileSync(fx.taskPath, "utf8")).toContain("engineer_crash_log:");
      clearEngineerCrashRecoveryState(deps, "0869");
      const onDisk = readFileSync(fx.taskPath, "utf8");
      expect(onDisk).not.toContain("engineer_crash_log:");
      // The switched pair is now the task's selection; it is not bounced back.
      expect(onDisk).toContain("cli_override: opencode");
      expect(onDisk).toContain("model_override: big-pickle");
      expect(onDisk).toContain("engineer_failover:");
    } finally {
      fx.restorePath();
    }
  });

  it("surfaces instead of replacing a human-set override", async () => {
    const fx = runnerFixture(CLEAN_SCRIPT);
    try {
      writeFileSync(
        fx.taskPath,
        readFileSync(fx.taskPath, "utf8").replace(
          "---\n## Problem",
          "cli_override: cursor\nmodel_override: composer\n---\n## Problem",
        ),
      );
      fx.config.budget = {
        allowlist: [
          { cli: "codex", models: ["gpt-5"] },
          { cli: "opencode", models: ["big-pickle"] },
        ],
      };
      fx.config.watchdog = { engineerCrashFailoverThreshold: 1 };
      const { deps, launches } = recoveryDeps(fx);
      const task = parseTask({
        content: readFileSync(fx.taskPath, "utf8"),
        absPath: fx.taskPath,
        root: fx.root,
        defaultStatus: fx.config.defaultStatus,
        defaultAssignee: fx.config.defaultAssignee,
      });
      (deps.index as unknown as { getTask: () => Task }).getTask = () => task;
      const outcome = await recoverEngineerAfterCrash(
        deps,
        "0869",
        { cli: "cursor", model: "composer", kind: "dev-error", reason: "boom" },
        { now: Date.parse("2026-10-20T12:00:00Z") },
      );
      expect(outcome.action).toBe("surfaced");
      expect(launches).toHaveLength(0);
      const onDisk = readFileSync(fx.taskPath, "utf8");
      expect(onDisk).toMatch(/needs_input: true/);
      expect(onDisk).toMatch(/human-set task override/);
      expect(onDisk).toContain("cli_override: cursor");
      expect(onDisk).toContain("model_override: composer");
    } finally {
      fx.restorePath();
    }
  });
});

describe("AgentRunner crash handling (#0869)", () => {
  it("reports a crash without a handoff signal once and suppresses the handoff", async () => {
    const fx = runnerFixture(CRASH_SCRIPT);
    try {
      const crashes: Array<{ kind: string; reason: string }> = [];
      let handoffs = 0;
      const runner = new AgentRunner(fx.config, () => {}, {
        stallTimeoutMs: 10_000,
        onEngineerCrash: (_taskId, info) => crashes.push(info),
        onHandoff: () => {
          handoffs++;
        },
      });
      runner.start(fx.task, "feat/0869-crash", fx.agent, { cwd: fx.root });
      await waitFor(() => crashes.length === 1, "crash callback");
      expect(crashes[0].kind).toBe("dev-error");
      expect(crashes[0].reason).toContain("boom");
      expect(handoffs).toBe(0);
      expect(runner.suppressesHandoffAfterCrash("0869")).toBe(true);
      expect(readFileSync(fx.taskPath, "utf8")).toMatch(/needs_input_reason: dev-error/);
    } finally {
      fx.restorePath();
    }
  });

  it("finalizes a handoff when the crashed turn carried the engineer's own signal", async () => {
    const fx = runnerFixture(CRASH_WITH_SIGNAL_SCRIPT);
    try {
      const crashes: unknown[] = [];
      let handoffs = 0;
      const runner = new AgentRunner(fx.config, () => {}, {
        stallTimeoutMs: 10_000,
        onEngineerCrash: (_taskId, info) => crashes.push(info),
        onHandoff: () => {
          handoffs++;
        },
      });
      runner.start(fx.task, "feat/0869-crash", fx.agent, { cwd: fx.root });
      await waitFor(() => handoffs === 1, "handoff callback");
      expect(crashes).toHaveLength(0);
      expect(runner.suppressesHandoffAfterCrash("0869")).toBe(false);
    } finally {
      fx.restorePath();
    }
  });

  it("clears a stale crash dev-error on the next successful turn", async () => {
    const fx = runnerFixture(CLEAN_SCRIPT);
    try {
      writeFileSync(
        fx.taskPath,
        readFileSync(fx.taskPath, "utf8").replace(
          "---\n## Problem",
          "needs_input: true\nneeds_input_reason: dev-error\nneeds_input_detail: stale crash\n---\n## Problem",
        ),
      );
      const runner = new AgentRunner(fx.config, () => {}, { stallTimeoutMs: 10_000 });
      const task = parseTask({
        content: readFileSync(fx.taskPath, "utf8"),
        absPath: fx.taskPath,
        root: fx.root,
        defaultStatus: fx.config.defaultStatus,
        defaultAssignee: fx.config.defaultAssignee,
      });
      runner.start(task, "feat/0869-crash", fx.agent, { cwd: fx.root });
      await waitFor(() => {
        const text = readFileSync(fx.taskPath, "utf8");
        return !text.includes("needs_input_reason: dev-error");
      }, "stale dev-error cleared");
    } finally {
      fx.restorePath();
    }
  });
});
