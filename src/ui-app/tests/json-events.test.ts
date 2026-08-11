/**
 * Structured agent output (0045). Unit tests for the opencode `--format json`
 * line parser plus a fake-`opencode` E2E that proves the runner spawns with
 * `--format json`, turns the event stream into structured transcript entries,
 * captures the session id from the event field, and resumes the same session.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner, parseJsonEvent } from "../../server/agents";
import type { Agent, RepoOSConfig, Task } from "../../core/types";

describe("parseJsonEvent", () => {
  it("parses an opencode text event", () => {
    const line =
      '{"type":"text","timestamp":1,"sessionID":"ses_abc",' +
      '"part":{"type":"text","text":"Hello from the agent."}}';
    expect(parseJsonEvent(line)).toEqual({
      entry: { type: "text", text: "Hello from the agent." },
      sessionID: "ses_abc",
    });
  });

  it("parses a bash tool_use with command input and output", () => {
    const line =
      '{"type":"tool_use","timestamp":1,"sessionID":"ses_abc",' +
      '"part":{"type":"tool","callID":"c1","tool":"bash",' +
      '"state":{"status":"completed","input":{"command":"ls -la"},"output":"total 24\\ndrwxr-xr-x"}}}';
    expect(parseJsonEvent(line)).toEqual({
      entry: {
        type: "tool",
        tool: "bash",
        input: "ls -la",
        output: "total 24\ndrwxr-xr-x",
        state: "completed",
      },
      sessionID: "ses_abc",
    });
  });

  it("stringifies object input/output for non-bash tools", () => {
    const line =
      '{"type":"tool_use","timestamp":1,"sessionID":"ses_abc",' +
      '"part":{"type":"tool","tool":"read",' +
      '"state":{"status":"completed","input":{"file_path":"a.txt"},"output":{"lines":["x"]}}}}';
    expect(parseJsonEvent(line)).toEqual({
      entry: {
        type: "tool",
        tool: "read",
        input: JSON.stringify({ file_path: "a.txt" }, null, 2),
        output: JSON.stringify({ lines: ["x"] }, null, 2),
        state: "completed",
      },
      sessionID: "ses_abc",
    });
  });

  it("surfaces the error message when a tool call fails", () => {
    const line =
      '{"type":"tool_use","timestamp":1,"sessionID":"ses_abc",' +
      '"part":{"type":"tool","tool":"bash",' +
      '"state":{"status":"error","input":{"command":"rm -rf /"},"error":"permission denied"}}}';
    expect(parseJsonEvent(line)).toEqual({
      entry: {
        type: "tool",
        tool: "bash",
        input: "rm -rf /",
        output: "permission denied",
        state: "error",
      },
      sessionID: "ses_abc",
    });
  });

  it("parses step boundaries", () => {
    expect(parseJsonEvent('{"type":"step_start","sessionID":"ses_abc","part":{"type":"step-start"}}')).toEqual({
      entry: { type: "step", kind: "start" },
      sessionID: "ses_abc",
    });
    expect(
      parseJsonEvent(
        '{"type":"step_finish","sessionID":"ses_abc","part":{"type":"step-finish","reason":"tool-calls"}}',
      ),
    ).toEqual({
      entry: { type: "step", kind: "finish", reason: "tool-calls" },
      sessionID: "ses_abc",
    });
  });

  it("turns a session error into a sys line", () => {
    const line =
      '{"type":"error","timestamp":1,"sessionID":"ses_abc",' +
      '"error":{"name":"APIError","data":{"message":"rate limited","statusCode":429,"isRetryable":true}}}';
    expect(parseJsonEvent(line)).toEqual({
      entry: { type: "sys", d: "error: rate limited" },
      sessionID: "ses_abc",
    });
  });

  it("surfaces an old-style file-update event", () => {
    expect(
      parseJsonEvent('{"type":"file-update","sessionID":"ses_abc","path":"src/a.ts"}'),
    ).toEqual({ entry: { type: "sys", d: "✎ src/a.ts" }, sessionID: "ses_abc" });
  });

  it("returns null for malformed and non-JSON lines", () => {
    expect(parseJsonEvent("plain claude output line")).toBeNull();
    expect(parseJsonEvent("")).toBeNull();
    expect(parseJsonEvent("{not json")).toBeNull();
    expect(parseJsonEvent('{"type":}')).toBeNull();
    expect(parseJsonEvent("42")).toBeNull();
    expect(parseJsonEvent("null")).toBeNull();
  });

  it("returns null for opencode noise events and other JSON schemas", () => {
    // qwen/codex style lines must fall back to the plain-line path.
    expect(parseJsonEvent('{"session_id":"sess-123"}')).toBeNull();
    expect(parseJsonEvent('{"type":"session-id","sessionID":"ses_abc"}')).toBeNull();
    expect(parseJsonEvent('{"type":"title","sessionID":"ses_abc"}')).toBeNull();
    expect(parseJsonEvent('{"type":"reasoning","sessionID":"ses_abc","part":{"type":"reasoning","text":"..."}}')).toBeNull();
    // empty text parts are dropped too
    expect(
      parseJsonEvent('{"type":"text","sessionID":"ses_abc","part":{"type":"text","text":"  "}}'),
    ).toBeNull();
  });
});

const FAKE_OPENCODE = `#!/usr/bin/env node
const fs = require("fs");
fs.appendFileSync(process.env.REPOOS_FAKEBIN_LOG, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd() }) + "\\n");
const events = [
  { type: "step_start", sessionID: "ses-123", part: { type: "step-start" } },
  { type: "text", sessionID: "ses-123", part: { type: "text", text: "I will inspect the repo." } },
  { type: "tool_use", sessionID: "ses-123", part: { type: "tool", tool: "bash", state: { status: "completed", input: { command: "ls" }, output: "AGENTS.md" } } },
  { type: "step_finish", sessionID: "ses-123", part: { type: "step-finish", reason: "stop" } },
  "not json at all"
];
for (const ev of events) {
  process.stdout.write((typeof ev === "string" ? ev : JSON.stringify(ev)) + "\\n");
}
`;

interface SpawnRecord {
  args: string[];
  cwd: string;
}

function makeFixture(): { bin: string; log: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-opencode-"));
  const bin = join(root, "bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "opencode"), FAKE_OPENCODE, { mode: 0o755 });
  return {
    bin,
    log: join(root, "spawns.log"),
    clean: () => rmSync(root, { recursive: true, force: true }),
  };
}

function withFakePath(fx: { bin: string }): string {
  const oldPath = process.env.PATH ?? "";
  process.env.PATH = `${fx.bin}:${oldPath}`;
  return oldPath;
}

function config(root: string): RepoOSConfig {
  return {
    root,
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
  };
}

const TASK: Task = {
  id: "0045",
  title: "JSON events",
  type: "feature",
  status: "ready",
  priority: "p1",
  area: "agent",
  assignee: "ai",
  assignedTo: "ai",
  createdBy: "",
  branch: "feat/json-events",
  tags: [],
  needsInput: false,
  created_at: null,
  updated_at: null,
  path: "work/0045-json.md",
  absPath: "/tmp/work/0045-json.md",
  body: "",
  extra: {},
  git: {
    branchExists: false,
    worktreeExists: false,
    lastCommit: null,
    lastCommitAt: null,
    worktreePath: null,
    dirty: false,
  },
};

const agent = (cli: string): Agent => ({ name: "engineer", cli, model: "big pickle", enabled: true });

async function waitFor(fn: () => boolean, label: string, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

function spawns(fx: { log: string }): SpawnRecord[] {
  const text = readFileSync(fx.log, "utf8").trim();
  if (!text) return [];
  return text.split("\n").map((l) => JSON.parse(l) as SpawnRecord);
}

afterEach(() => {
  delete process.env.REPOOS_FAKEBIN_LOG;
});

describe("opencode driver (structured JSON events)", () => {
  it("spawns --format json, parses structured entries, and resumes by session id", async () => {
    const fx = makeFixture();
    const oldPath = withFakePath(fx);
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    try {
      const runner = new AgentRunner(config(fx.bin), () => {});
      const cwd = join(fx.bin, "wt", "opencode");
      mkdirSync(cwd, { recursive: true });
      const start = runner.start(TASK, "feat/json-events", agent("opencode"), { cwd });
      expect(start.ok).toBe(true);

      await waitFor(() => !runner.isRunning("0045"), "opencode first-turn exit");

      const lines = runner.output("0045")!.lines;
      expect(lines).toEqual([
        { type: "step", kind: "start" },
        { type: "text", text: "I will inspect the repo." },
        {
          type: "tool",
          tool: "bash",
          input: "ls",
          output: "AGENTS.md",
          state: "completed",
        },
        { type: "step", kind: "finish", reason: "stop" },
        { s: "out", d: "not json at all" },
      ]);
      expect(runner.output("0045")!.sessionId).toBe("ses-123");

      const [run] = spawns(fx);
      expect(run.args[0]).toBe("run");
      expect(run.args).toEqual(expect.arrayContaining(["--format", "json"]));
      expect(run.args).toEqual(expect.arrayContaining(["--dir", cwd]));
      // --auto is load-bearing: stdin is ignored, so an unanswered permission
      // prompt hangs the process forever (confirmed live on #0069 — ~2 hours
      // at ~1% CPU with zero commits before being killed).
      expect(run.args).toContain("--auto");
      expect(run.args[run.args.length - 1]).toContain("Task #0045");

      const resumed = runner.send("0045", "continue the work", agent("opencode"));
      expect(resumed.ok).toBe(true);
      await waitFor(() => spawns(fx).length === 2, "opencode resume spawn");
      await waitFor(() => !runner.isRunning("0045"), "resume turn exit");

      const [, resume] = spawns(fx);
      expect(resume.args.slice(0, 3)).toEqual(["run", "--format", "json"]);
      expect(resume.args).toEqual(
        expect.arrayContaining(["--session", "ses-123", "--dir", cwd]),
      );
      expect(resume.args).toContain("--auto");
    } finally {
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      fx.clean();
    }
  });

  it("flushes a trailing JSON event with no final newline as a structured entry", async () => {
    const fx = makeFixture();
    const oldPath = withFakePath(fx);
    const bin = join(fx.bin, "opencode");
    writeFileSync(
      bin,
      `#!/usr/bin/env node
process.stdout.write('{"type":"text","sessionID":"ses-abc","part":{"type":"text","text":"final"},"timestamp":1}');`,
      { mode: 0o755 },
    );
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    try {
      const runner = new AgentRunner(config(fx.bin), () => {});
      runner.start(TASK, "feat/json-events", agent("opencode"), { cwd: fx.bin });
      await waitFor(() => !runner.isRunning("0045"), "no-newline turn exit");
      const lines = runner.output("0045")!.lines;
      expect(lines).toContainEqual({ type: "text", text: "final" });
    } finally {
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      fx.clean();
    }
  });
});
