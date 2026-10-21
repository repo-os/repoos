/**
 * #0889 — a NUL byte in prompt text must never reach a process argument.
 *
 * #0877's crash detail was a degenerate-output excerpt made of NULs. Crash
 * recovery pasted it into the resume instruction, Node's `spawn` rejected
 * `args[6]`, and the engineer stayed dead until a human started it by hand.
 * The shared sanitizer runs at every agent-CLI spawn boundary, so the table
 * below drives start, resume, message delivery and crash recovery with a NUL in
 * each kind of prompt input: the task body (context pack), a log line, and a
 * path.
 */
import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../../server/agents";
import { recoverEngineerAfterCrash } from "../../server/engineer-crash-recovery";
import { parseTask } from "../../core/task";
import type { LiveIndex } from "../../server/live-index";
import type { Logger } from "../../core/logger";
import type { Agent, RepoOSConfig, Task } from "../../core/types";
import { waitFor } from "./helpers";

const NUL = "\u0000";

const roots: string[] = [];
const restores: Array<() => void> = [];
afterEach(() => {
  for (const restore of restores.splice(0)) restore();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** Fake CLI: append its argv as one JSON line, then finish a short turn. */
const FAKE_OPENCODE = `#!/usr/bin/env node
const fs = require("fs");
if (process.env.REPOOS_ARGV_LOG) {
  fs.appendFileSync(process.env.REPOOS_ARGV_LOG, JSON.stringify(process.argv.slice(2)) + "\\n");
}
process.stdout.write("working\\n");
setTimeout(() => process.exit(0), 250);
`;

interface Fixture {
  root: string;
  taskPath: string;
  argvLog: string;
  config: RepoOSConfig;
  task: Task;
  agent: Agent;
}

function fixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), "repoos-0889-"));
  roots.push(root);
  const work = join(root, "work");
  const bin = join(root, "bin");
  mkdirSync(work, { recursive: true });
  mkdirSync(bin, { recursive: true });
  const taskPath = join(work, "0889-nul.md");
  writeFileSync(
    taskPath,
    `---
id: "0889"
title: NUL prompt arguments
type: bug
status: active
priority: p2
area: server
assigned_to: ai
branch: feat/0889-nul
---
## Problem
A prompt can carry agent output.
`,
  );
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
  execFileSync("git", ["commit", "-qm", "initial"], { cwd: root });
  writeFileSync(join(bin, "opencode"), FAKE_OPENCODE, { mode: 0o755 });
  const argvLog = join(root, "argv.log");
  const previousPath = process.env.PATH;
  const previousLog = process.env.REPOOS_ARGV_LOG;
  restores.push(() => {
    process.env.PATH = previousPath;
    if (previousLog === undefined) delete process.env.REPOOS_ARGV_LOG;
    else process.env.REPOOS_ARGV_LOG = previousLog;
  });
  process.env.PATH = `${bin}:${previousPath ?? ""}`;
  process.env.REPOOS_ARGV_LOG = argvLog;
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
    // This suite exercises the spawn boundary, not scheduling. A busy machine
    // (the full `repoos check` runs many files in parallel) would otherwise
    // queue these starts behind the pressure guard and blow the test timeout.
    pressureGuard: { enabled: false },
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
  return { root, taskPath, argvLog, config, task, agent };
}

function recordedArgs(log: string): string[][] {
  try {
    return readFileSync(log, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as string[]);
  } catch {
    return [];
  }
}

/** Every recorded argv is NUL-free and still carries the marker text. */
function expectCleanArgs(log: string, marker: string): void {
  const calls = recordedArgs(log);
  expect(calls.length).toBeGreaterThan(0);
  const all = calls.flat();
  expect(all.some((arg) => arg.includes(NUL))).toBe(false);
  expect(all.join("\n")).toContain(marker);
}

/** A NUL in each kind of input the prompt is assembled from. */
const SOURCES = [
  {
    source: "task body",
    make: (marker: string) => `## Task Specification\n${marker} body${NUL}tail\n`,
  },
  {
    source: "log line",
    make: (marker: string) => `✗ crash while reading input${NUL} from stdin (${marker})`,
  },
  {
    source: "path",
    make: (marker: string) => `Working directory: /tmp/${marker}${NUL}worktree`,
  },
] as const;

const PATHS = ["start", "resume", "message-delivery", "recovery"] as const;

// Each case prepends a private bin dir to process.env.PATH — run sequentially.
describe.sequential("agent CLI argv sanitizing (#0889)", () => {
  it.each(
    SOURCES.flatMap(({ source, make }) =>
      PATHS.map((path) => ({ source, make, path, marker: `MARK_${path}_0889` })),
    ),
  )("keeps NULs out on $path with a NUL in a $source", async ({ source, make, path, marker }) => {
    const fx = fixture();
    const runner = new AgentRunner(fx.config, () => {}, {
      stallTimeoutMs: 10_000,
      getTask: () =>
        parseTask({
          content: readFileSync(fx.taskPath, "utf8"),
          absPath: fx.taskPath,
          root: fx.config.root,
          defaultStatus: fx.config.defaultStatus,
          defaultAssignee: fx.config.defaultAssignee,
        }),
    });
    const branch = fx.task.branch ?? "feat/0889-nul";
    const text = make(marker);
    try {
      if (path === "start") {
        // The context pack is where a task body (and its Activity log) lands.
        const started = runner.start(fx.task, branch, fx.agent, {
          cwd: fx.root,
          contextPack: `## Task Context Pack\n${text}`,
          resumePreamble: text,
        });
        expect(started.ok).toBe(true);
        await waitFor(() => recordedArgs(fx.argvLog).length === 1, "start spawn");
        expectCleanArgs(fx.argvLog, marker);
        // The prompt changed, so the task records one activity line.
        expect(readFileSync(fx.taskPath, "utf8")).toContain("prompt sanitized");
        expect(readFileSync(fx.taskPath, "utf8")).not.toContain(NUL);
      }

      if (path === "resume") {
        expect(runner.start(fx.task, branch, fx.agent, { cwd: fx.root }).ok).toBe(true);
        await waitFor(() => recordedArgs(fx.argvLog).length === 1, "first spawn");
        await waitFor(() => !runner["entries"].has(fx.task.id), "first turn to end");
        const sent = runner.send(fx.task.id, text, fx.agent);
        expect(sent.ok).toBe(true);
        await waitFor(() => recordedArgs(fx.argvLog).length === 2, "resume spawn");
        expectCleanArgs(fx.argvLog, marker);
      }

      if (path === "message-delivery") {
        expect(runner.start(fx.task, branch, fx.agent, { cwd: fx.root }).ok).toBe(true);
        // Queue while the turn is live; the runner delivers it at turn end.
        expect(runner.send(fx.task.id, text, fx.agent)).toMatchObject({
          ok: true,
          queued: true,
        });
        await waitFor(() => recordedArgs(fx.argvLog).length === 2, "delivery spawn");
        expectCleanArgs(fx.argvLog, marker);
      }

      if (path === "recovery") {
        const instructions: string[] = [];
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
          launch: async (_deps: unknown, _task: unknown, instruction: string) => {
            instructions.push(instruction);
            return { ok: true as const };
          },
        };
        const outcome = await recoverEngineerAfterCrash(
          deps,
          fx.task.id,
          {
            cli: "opencode",
            model: "test-model",
            kind: "degenerate-output",
            reason: `Degenerate output loop detected. Excerpt: "${text}"`,
          },
          { now: Date.parse("2026-10-21T09:26:00Z") },
        );
        expect(outcome.action).toBe("resumed");
        expect(instructions).toHaveLength(1);
        expect(instructions[0]).not.toContain(NUL);
        expect(instructions[0]).toContain(marker);
        // The recovered turn spawns through the same sanitizing boundary.
        const started = runner.start(fx.task, branch, fx.agent, {
          cwd: fx.root,
          resumePreamble: instructions[0],
          fromCrashRecovery: true,
        });
        expect(started.ok).toBe(true);
        await waitFor(() => recordedArgs(fx.argvLog).length === 1, "recovery spawn");
        expectCleanArgs(fx.argvLog, marker);
        expect(readFileSync(fx.taskPath, "utf8")).toContain(
          "stripped NUL bytes from the crash detail",
        );
      }
    } finally {
      runner.dispose();
    }
  }, 20_000);
});
