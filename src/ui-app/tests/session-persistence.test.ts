import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { AgentRunner } from "../../server/agents";
import type { Agent, RepoOSConfig, Task } from "../../core/types";
import { waitFor } from "./helpers";

const roots: string[] = [];
let originalPath = process.env.PATH;

function fixture(status: "active" | "review" | "done" = "active") {
  const root = mkdtempSync(join(tmpdir(), "repoos-sessions-"));
  roots.push(root);
  const work = join(root, "work");
  const bin = join(root, "bin");
  mkdirSync(work, { recursive: true });
  mkdirSync(bin, { recursive: true });
  const taskFile = join(work, "0001-session.md");
  writeFileSync(
    taskFile,
    `---
id: "0001"
title: Session test
type: feature
status: ${status}
priority: p2
area: server
assigned_to: ai
branch: feat/session-test
---
## Test
`,
  );
  writeFileSync(
    join(bin, "qwen"),
    `#!/usr/bin/env node
process.stdout.write("persisted output\\n");
process.stdout.write('{"session_id":"session-persisted"}\\n');
if (process.env.REPOOS_SESSION_TEST_HOLD === "1") setTimeout(() => {}, 800);
`,
    { mode: 0o755 },
  );
  originalPath = process.env.PATH;
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
    title: "Session test",
    type: "feature",
    status,
    priority: "p2",
    area: "server",
    assignee: "ai",
    assignedTo: "ai",
    createdBy: "",
    branch: "feat/session-test",
    tags: [],
    needsInput: false,
    needsMerge: false,
    created_at: null,
    updated_at: null,
    path: "work/0001-session.md",
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
  return { root, config, task, file: join(root, ".repoos", "sessions", "0001.json") };
}

const agent: Agent = { name: "engineer", cli: "qwen code", model: "default", enabled: true };

function saved(lines: unknown[], completedAt?: string): string {
  return JSON.stringify({
    version: 1,
    lines,
    sessionId: "disk-session",
    engine: "plain",
    workdir: "/tmp/worktree",
    completedAt,
    updatedAt: "2026-08-01T00:00:00.000Z",
  });
}

afterEach(() => {
  process.env.PATH = originalPath;
  delete process.env.REPOOS_SESSION_TEST_HOLD;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("agent session persistence", () => {
  it("debounces line writes with the 500 ms production delay", async () => {
    const fx = fixture("active");
    process.env.REPOOS_SESSION_TEST_HOLD = "1";
    const runner = new AgentRunner(fx.config, () => {});
    runner.start(fx.task, fx.task.branch, agent, { cwd: fx.root });
    await waitFor(
      () => (runner.output(fx.task.id)?.lines.length ?? 0) === 2,
      "streamed lines",
    );
    expect(existsSync(fx.file)).toBe(false);
    await waitFor(() => existsSync(fx.file), "debounced transcript write");
    expect(runner.isRunning(fx.task.id)).toBe(true);
    await waitFor(() => !runner.isRunning(fx.task.id), "held fixture exit");
  });

  it("serializes a session and preloads active history on boot", async () => {
    const fx = fixture("active");
    const first = new AgentRunner(fx.config, () => {}, { writeDelayMs: 10 });
    expect(first.start(fx.task, fx.task.branch, agent, { cwd: fx.root }).ok).toBe(true);
    await waitFor(() => !first.isRunning(fx.task.id), "fixture agent exit");

    const disk = JSON.parse(readFileSync(fx.file, "utf8")) as Record<string, unknown>;
    expect(disk.version).toBe(1);
    expect(disk.sessionId).toBe("session-persisted");
    expect(disk.engine).toBe("plain");
    expect(disk.workdir).toBe(fx.root);
    expect(disk.lines).toEqual([
      { s: "out", d: "persisted output" },
      { s: "out", d: '{"session_id":"session-persisted"}' },
    ]);

    const rebooted = new AgentRunner(fx.config, () => {});
    unlinkSync(fx.file);
    expect(rebooted.output(fx.task.id)?.sessionId).toBe("session-persisted");
    expect(rebooted.output(fx.task.id)?.lines).toHaveLength(2);
  });

  it("loads a cold session for start and preserves its earlier lines", async () => {
    const fx = fixture("done");
    mkdirSync(join(fx.root, ".repoos", "sessions"), { recursive: true });
    writeFileSync(fx.file, saved([{ s: "out", d: "from disk" }], "2026-08-01T00:00:00.000Z"));
    const runner = new AgentRunner(fx.config, () => {}, { writeDelayMs: 10 });

    expect(runner.start(fx.task, fx.task.branch, agent, { cwd: fx.root }).ok).toBe(true);
    await waitFor(() => !runner.isRunning(fx.task.id), "cold-session agent exit");
    expect(runner.output(fx.task.id)?.lines).toEqual(
      expect.arrayContaining([
        { s: "out", d: "from disk" },
        { s: "out", d: "persisted output" },
      ]),
    );
  });

  it("hydrates a persisted guide session before sending a follow-up", async () => {
    const fx = fixture("done");
    const guideFile = join(fx.root, ".repoos", "sessions", "repoos-guide.json");
    mkdirSync(join(fx.root, ".repoos", "sessions"), { recursive: true });
    writeFileSync(
      guideFile,
      JSON.stringify({
        ...JSON.parse(saved([{ s: "out", d: "from guide" }])),
        workdir: fx.root,
      }),
    );
    const runner = new AgentRunner(fx.config, () => {}, { writeDelayMs: 10 });

    expect(runner.send("repoos-guide", "What changed?", agent).ok).toBe(true);
    await waitFor(() => !runner.isRunning("repoos-guide"), "guide follow-up exit");
    expect(runner.output("repoos-guide")?.lines).toEqual(
      expect.arrayContaining([
        { s: "out", d: "from guide" },
        { type: "human", text: "What changed?" },
        { s: "out", d: "persisted output" },
      ]),
    );
  });

  it("flushes completed sessions, evicts RAM, and serves output cold from disk", async () => {
    const fx = fixture("active");
    const runner = new AgentRunner(fx.config, () => {}, { writeDelayMs: 10 });
    runner.start(fx.task, fx.task.branch, agent, { cwd: fx.root });
    await waitFor(() => !runner.isRunning(fx.task.id), "completion fixture exit");

    runner.complete(fx.task.id);
    const disk = JSON.parse(readFileSync(fx.file, "utf8")) as { completedAt?: string };
    expect(disk.completedAt).toBeTypeOf("string");
    expect(runner.output(fx.task.id)?.lines).toHaveLength(2);
    unlinkSync(fx.file);
    expect(runner.output(fx.task.id)).toBeNull();
  });

  it("prunes completed files by age and count while retaining hot files", () => {
    const fx = fixture("done");
    const dir = join(fx.root, ".repoos", "sessions");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "old.json"), saved([], "2026-06-01T00:00:00.000Z"));
    writeFileSync(join(dir, "newer.json"), saved([], "2026-08-09T00:00:00.000Z"));
    writeFileSync(join(dir, "newest.json"), saved([], "2026-08-10T00:00:00.000Z"));
    writeFileSync(join(dir, "active.json"), saved([{ s: "out", d: "hot" }]));

    new AgentRunner(fx.config, () => {}, {
      retentionDays: 30,
      retentionCount: 1,
      now: () => new Date("2026-08-12T00:00:00.000Z"),
    });

    expect(existsSync(join(dir, "old.json"))).toBe(false);
    expect(existsSync(join(dir, "newer.json"))).toBe(false);
    expect(existsSync(join(dir, "newest.json"))).toBe(true);
    expect(existsSync(join(dir, "active.json"))).toBe(true);
  });

  it("ignores corrupt and partial session files without preventing boot", () => {
    const fx = fixture("active");
    mkdirSync(join(fx.root, ".repoos", "sessions"), { recursive: true });
    writeFileSync(fx.file, '{"version":1,"lines":[');
    expect(() => new AgentRunner(fx.config, () => {})).not.toThrow();
    expect(new AgentRunner(fx.config, () => {}).output(fx.task.id)).toBeNull();
  });
});
