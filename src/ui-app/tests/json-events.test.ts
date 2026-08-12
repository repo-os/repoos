/**
 * Structured agent output (0045). Unit tests for the opencode `--format json`
 * line parser plus a fake-`opencode` E2E that proves the runner spawns with
 * `--format json`, turns the event stream into structured transcript entries,
 * captures the session id from the event field, and resumes the same session.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner, parseClaudeEvent, parseJsonEvent } from "../../server/agents";
import type { Agent, RepoOSConfig, Task } from "../../core/types";
import { waitFor } from "./helpers";

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
    const start = parseJsonEvent('{"type":"step_start","sessionID":"ses_abc","part":{"type":"step-start"}}');
    expect(start).toEqual({
      entry: expect.objectContaining({ type: "step", kind: "start" }),
      sessionID: "ses_abc",
    });
    expect((start?.entry as { at?: string }).at).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const finish = parseJsonEvent(
      '{"type":"step_finish","sessionID":"ses_abc","part":{"type":"step-finish","reason":"tool-calls"}}',
    );
    expect(finish).toEqual({
      entry: expect.objectContaining({ type: "step", kind: "finish", reason: "tool-calls" }),
      sessionID: "ses_abc",
    });
    expect((finish?.entry as { at?: string }).at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
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

describe("parseClaudeEvent (0109)", () => {
  /**
   * Uses the live-captured event shapes from the task file (claude 2.1.220
   * `--output-format stream-json --verbose`) so the parser is pinned to what
   * the CLI actually emits, never an invented schema.
   */
  it("captures the real session id from the system/init event", () => {
    expect(
      parseClaudeEvent(
        '{"type":"system","subtype":"init","session_id":"78dc4e6a-abcd","model":"claude-sonnet-5"}',
      ),
    ).toEqual({ sessionID: "78dc4e6a-abcd" });
  });

  it("swallows rate_limit events", () => {
    expect(
      parseClaudeEvent('{"type":"rate_limit_event","rate_limit_info":{"status":"allowed_warning","utilization":0.25}}'),
    ).toEqual({});
  });

  it("maps thinking_tokens and post_turn_summary to step boundaries", () => {
    expect(parseClaudeEvent('{"type":"system","subtype":"thinking_tokens"}')).toEqual({
      entry: expect.objectContaining({ type: "step", kind: "start" }),
    });
    expect(parseClaudeEvent('{"type":"system","subtype":"post_turn_summary"}')).toEqual({
      entry: expect.objectContaining({ type: "step", kind: "finish" }),
    });
  });

  it("swallows thinking-only assistant messages instead of dumping their JSON", () => {
    expect(
      parseClaudeEvent('{"type":"assistant","message":{"content":[{"type":"thinking","thinking":"…","signature":"s"}]}}'),
    ).toEqual({});
  });

  it("buffers a tool_use until its tool_result arrives", () => {
    const line =
      '{"type":"assistant","message":{"content":[' +
      '{"type":"tool_use","id":"toolu_013dX","name":"Read","input":{"file_path":"/private/tmp/ccprobe/sample.txt"},"caller":{"type":"direct"}}]}}';
    expect(parseClaudeEvent(line)).toEqual({
      pendingTool: {
        id: "toolu_013dX",
        name: "Read",
        input: JSON.stringify({ file_path: "/private/tmp/ccprobe/sample.txt" }, null, 2),
      },
    });
  });

  it("returns a tool_result payload carrying the rendered output", () => {
    expect(
      parseClaudeEvent(
        '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_013dX","content":"1\\thello world\\n2\\t"}]}}',
      ),
    ).toEqual({ toolResult: { id: "toolu_013dX", content: "1\thello world\n2\t" } });
  });

  it("parses assistant text into a text entry", () => {
    expect(
      parseClaudeEvent('{"type":"assistant","message":{"content":[{"type":"text","text":"Hello world greeting."}]}}'),
    ).toEqual({ entry: { type: "text", text: "Hello world greeting." } });
  });

  it("swallows the terminal result event (its numbers feed extractUsage)", () => {
    expect(
      parseClaudeEvent(
        '{"type":"result","subtype":"success","is_error":false,"num_turns":2,"duration_ms":4677,"total_cost_usd":0.0731223,"result":"Hello world greeting.","usage":{"input_tokens":4,"output_tokens":91}}',
      ),
    ).toEqual({});
  });

  it("falls back to null for non-JSON, malformed, and other engines' JSON", () => {
    expect(parseClaudeEvent("Warning: no stdin data received in 3s, proceeding without it")).toBeNull();
    expect(parseClaudeEvent("")).toBeNull();
    expect(parseClaudeEvent("{not json")).toBeNull();
    expect(parseClaudeEvent('{"type":}')).toBeNull();
    // opencode's shapes must NOT be misread as claude events — the parser
    // branches stay separate (the #0109 regression guard).
    expect(parseClaudeEvent('{"type":"text","sessionID":"ses","part":{"type":"text","text":"hi"}}')).toBeNull();
    expect(parseClaudeEvent('{"type":"step_start","part":{"type":"step-start"}}')).toBeNull();
    expect(parseClaudeEvent('{"session_id":"sess-123"}')).toBeNull();
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
  needsMerge: false,
  created_at: null,
  updated_at: null,
  path: "work/0045-json.md",
  absPath: "/tmp/work/0045-json.md",
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

const agent = (cli: string): Agent => ({ name: "engineer", cli, model: "big pickle", enabled: true });

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
        expect.objectContaining({ type: "step", kind: "start" }),
        { type: "text", text: "I will inspect the repo." },
        {
          type: "tool",
          tool: "bash",
          input: "ls",
          output: "AGENTS.md",
          state: "completed",
        },
        expect.objectContaining({ type: "step", kind: "finish", reason: "stop" }),
        { s: "out", d: "not json at all" },
      ]);
      for (const line of lines) {
        if (typeof line === "object" && "type" in line && line.type === "step") {
          expect(line.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        }
      }
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

/**
 * The live-captured claude stream from the 0109 task file, replayed as a fake
 * `claude` binary: system/init, rate_limit, thinking_tokens, a thinking-only
 * assistant event, a Read tool_use + tool_result pair, an assistant text
 * message carrying `message.usage`, post_turn_summary, the terminal `result`
 * with the authoritative usage/cost, and a non-JSON stdin warning line.
 */
const FAKE_CLAUDE = `#!/usr/bin/env node
const fs = require("fs");
fs.appendFileSync(process.env.REPOOS_FAKEBIN_LOG, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd() }) + "\\n");
const events = [
  { type: "system", subtype: "init", session_id: "78dc4e6a-abcd", model: "claude-sonnet-5" },
  { type: "rate_limit_event", rate_limit_info: { status: "allowed_warning", utilization: 0.25 } },
  { type: "system", subtype: "thinking_tokens" },
  { type: "assistant", message: { content: [{ type: "thinking", thinking: "…", signature: "sig" }] } },
  { type: "assistant", message: { content: [{ type: "tool_use", id: "toolu_013dX", name: "Read", input: { file_path: "/private/tmp/ccprobe/sample.txt" }, caller: { type: "direct" } }] } },
  { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "toolu_013dX", content: "1\\thello world\\n2\\t" }] } },
  { type: "assistant", message: { content: [{ type: "text", text: "Hello world greeting." }], usage: { input_tokens: 2, output_tokens: 88 } } },
  { type: "system", subtype: "post_turn_summary" },
  { type: "result", subtype: "success", is_error: false, num_turns: 2, duration_ms: 4677, total_cost_usd: 0.0731223, result: "Hello world greeting.", usage: { input_tokens: 4, output_tokens: 91, cache_creation_input_tokens: 9403, cache_read_input_tokens: 49071 } },
  "Warning: no stdin data received in 3s, proceeding without it"
];
for (const ev of events) {
  process.stdout.write((typeof ev === "string" ? ev : JSON.stringify(ev)) + "\\n");
}
`;

function makeClaudeFixture(): { bin: string; log: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-claude-"));
  const bin = join(root, "bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "claude"), FAKE_CLAUDE, { mode: 0o755 });
  return {
    bin,
    log: join(root, "spawns.log"),
    clean: () => rmSync(root, { recursive: true, force: true }),
  };
}

describe("claude code driver (stream-json events, 0109)", () => {
  it("streams structured entries, captures the init session id, and reports usage/cost", async () => {
    const fx = makeClaudeFixture();
    const oldPath = withFakePath(fx);
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    try {
      const runner = new AgentRunner(config(fx.bin), () => {});
      const cwd = join(fx.bin, "wt", "claude");
      mkdirSync(cwd, { recursive: true });
      const start = runner.start(TASK, "feat/json-events", agent("claude code"), { cwd });
      expect(start.ok).toBe(true);

      await waitFor(() => !runner.isRunning("0045"), "claude first-turn exit");

      const lines = runner.output("0045")!.lines;
      // Voiceless events (init / rate_limit / thinking / result) and the
      // buffered tool_use never surface as raw JSON or duplicate cards — only
      // the meaningful transcript shows.
      expect(lines).toEqual([
        expect.objectContaining({ type: "step", kind: "start" }),
        {
          type: "tool",
          tool: "Read",
          input: JSON.stringify({ file_path: "/private/tmp/ccprobe/sample.txt" }, null, 2),
          output: "1\thello world\n2\t",
        },
        { type: "text", text: "Hello world greeting." },
        expect.objectContaining({ type: "step", kind: "finish" }),
        { s: "out", d: "Warning: no stdin data received in 3s, proceeding without it" },
      ]);
      // Session id comes from the system/init event field, not regex scraping.
      expect(runner.output("0045")!.sessionId).toBe("78dc4e6a-abcd");

      // The terminal result event's numbers converge into the counters: 95 =
      // input 4 + output 91 (cache fields deliberately NOT summed in), and the
      // authoritative cost replaces the per-message figures.
      const stats = runner.stats("0045");
      expect(stats.tokens).toBe(95);
      expect(stats.costUsd).toBe(0.0731223);

      const [run] = spawns(fx);
      expect(run.args[0]).toBe("-p");
      expect(run.args[1]).toContain("Task #0045");
      expect(run.args).toEqual(expect.arrayContaining(["--output-format", "stream-json"]));
      expect(run.args).toContain("--verbose");
      expect(run.args).toContain("--dangerously-skip-permissions");

      // A follow-up turn resumes the same session by the captured id.
      const resumed = runner.send("0045", "continue the work", agent("claude code"));
      expect(resumed.ok).toBe(true);
      await waitFor(() => spawns(fx).length === 2, "claude resume spawn");
      await waitFor(() => !runner.isRunning("0045"), "resume turn exit");

      const [, resume] = spawns(fx);
      expect(resume.args).toEqual([
        "-p",
        "--resume",
        "78dc4e6a-abcd",
        "continue the work",
        "--model",
        "big pickle",
        "--output-format",
        "stream-json",
        "--verbose",
        "--dangerously-skip-permissions",
      ]);
      expect(resume.cwd).toBe(realpathSync(cwd));
    } finally {
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      fx.clean();
    }
  });

  it("flushes an unfulfilled tool_use card when the turn ends without its result", async () => {
    const fx = makeClaudeFixture();
    const oldPath = withFakePath(fx);
    const bin = join(fx.bin, "claude");
    writeFileSync(
      bin,
      `#!/usr/bin/env node
process.stdout.write('{"type":"system","subtype":"init","session_id":"s-abcd"}\\n');
process.stdout.write('{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Bash","input":{"command":"ls"}}]}}\\n');`,
      { mode: 0o755 },
    );
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    try {
      const runner = new AgentRunner(config(fx.bin), () => {});
      runner.start(TASK, "feat/json-events", agent("claude code"), { cwd: fx.bin });
      await waitFor(() => !runner.isRunning("0045"), "interrupted turn exit");
      expect(runner.output("0045")!.lines).toContainEqual({
        type: "tool",
        tool: "Bash",
        input: "ls",
      });
    } finally {
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      fx.clean();
    }
  });
});
