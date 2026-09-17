/**
 * Cursor Agent CLI driver (#0398). Fixture-driven tests for Cursor's
 * `--output-format stream-json` protocol, plus real process/argv tests proving
 * RepoOS spawns the explicit `cursor-agent` binary (never a bare `agent`), runs
 * in the task worktree, resumes the exact captured session, and passes a model
 * only when one is configured. Fake binaries keep the suite deterministic.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner, cursorErrorHint, parseCursorEvent } from "../../server/agents";
import { parseCursorModels, MODEL_SOURCES } from "../../core/models";
import { detectAgents, type KnownAgent } from "../../core/detect";
import type { Agent, RepoOSConfig, Task } from "../../core/types";
import { waitFor } from "./helpers";

describe("parseCursorEvent", () => {
  it("captures the session id and model from system/init", () => {
    const line =
      '{"type":"system","subtype":"init","apiKeySource":"login",' +
      '"cwd":"/tmp/wt","session_id":"c6b62c6f-7ead","model":"Auto"}';
    expect(parseCursorEvent(line)).toEqual({ sessionID: "c6b62c6f-7ead", model: "Auto" });
  });

  it("surfaces assistant text and ignores the user echo", () => {
    expect(
      parseCursorEvent(
        '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"I will read the README."}]},"session_id":"s1"}',
      ),
    ).toEqual({ entry: { type: "text", text: "I will read the README." }, sessionID: "s1" });
    expect(parseCursorEvent('{"type":"user","message":{"content":[]},"session_id":"s1"}')).toEqual({
      sessionID: "s1",
    });
  });

  it("parses a tool_call started event into a pending tool", () => {
    const line =
      '{"type":"tool_call","subtype":"started","call_id":"call-1",' +
      '"tool_call":{"readToolCall":{"args":{"path":"README.md"}}},"session_id":"s1"}';
    expect(parseCursorEvent(line)).toEqual({
      pendingTool: { id: "call-1", name: "read", input: "README.md" },
      sessionID: "s1",
    });
  });

  it("parses a tool_call completed event into a result", () => {
    const line =
      '{"type":"tool_call","subtype":"completed","call_id":"call-1",' +
      '"tool_call":{"readToolCall":{"args":{"path":"README.md"},"result":{"success":{"content":"# Project"}}}},"session_id":"s1"}';
    expect(parseCursorEvent(line)).toEqual({
      toolResult: { id: "call-1", output: "# Project" },
      sessionID: "s1",
    });
  });

  it("marks a failed tool result as an error", () => {
    const line =
      '{"type":"tool_call","subtype":"completed","call_id":"c2",' +
      '"tool_call":{"function":{"name":"shell","arguments":"{\\"command\\":\\"bun test\\"}"},' +
      '"error":{"message":"permission denied"}},"session_id":"s1"}';
    const parsed = parseCursorEvent(line);
    expect(parsed?.toolResult).toEqual({
      id: "c2",
      output: "permission denied",
      isError: true,
    });
  });

  it("turns an error event into a sys line", () => {
    expect(parseCursorEvent('{"type":"error","message":"rate limited","session_id":"s1"}')).toEqual(
      { entry: { type: "sys", d: "error: rate limited" }, sessionID: "s1" },
    );
  });

  it("swallows the terminal result but keeps duration and session", () => {
    expect(
      parseCursorEvent(
        '{"type":"result","subtype":"success","is_error":false,"duration_ms":5234,"result":"done","session_id":"s1"}',
      ),
    ).toEqual({ sessionID: "s1", durationMs: 5234 });
  });

  it("surfaces a failed terminal result as a sys error", () => {
    expect(
      parseCursorEvent(
        '{"type":"result","subtype":"error","is_error":true,"result":"boom","session_id":"s1"}',
      ),
    ).toEqual({ entry: { type: "sys", d: "error: boom" }, sessionID: "s1" });
  });

  it("swallows unknown future event types instead of dumping raw JSON", () => {
    expect(parseCursorEvent('{"type":"thinking_delta","delta":"…","session_id":"s1"}')).toEqual({
      sessionID: "s1",
    });
  });

  it("returns null for malformed or non-JSON lines", () => {
    expect(parseCursorEvent("not json at all")).toBeNull();
    expect(parseCursorEvent("{truncated")).toBeNull();
    expect(parseCursorEvent("42")).toBeNull();
  });
});

describe("cursorErrorHint", () => {
  it("maps auth, permission, and version failures to actionable advice", () => {
    expect(cursorErrorHint("Error: not authenticated")).toContain("cursor-agent login");
    expect(cursorErrorHint("permission denied for command")).toContain("--force");
    expect(cursorErrorHint("unknown option '--nope'")).toContain("cursor-agent update");
  });

  it("returns null for ordinary tool output", () => {
    expect(cursorErrorHint("bun test passed")).toBeNull();
  });
});

describe("parseCursorModels", () => {
  it("parses `<id> - <display>` rows and drops the header", () => {
    const text = [
      "Available models",
      "",
      "auto - Auto (current, default)",
      "gpt-5.3-codex - Codex 5.3",
      "claude-opus-4-8-high - Claude Opus 4.8 1M",
    ].join("\n");
    expect(parseCursorModels(text)).toEqual(["auto", "gpt-5.3-codex", "claude-opus-4-8-high"]);
  });

  it("strips ANSI and ignores non-matching lines", () => {
    expect(parseCursorModels("\u001b[32mfoo - Bar\u001b[0m\nnope\n")).toEqual(["foo"]);
  });
});

const FAKE_CURSOR = `#!/usr/bin/env node
const fs = require("fs");
fs.appendFileSync(process.env.REPOOS_FAKEBIN_LOG, JSON.stringify({ bin: process.argv[1], args: process.argv.slice(2), cwd: process.cwd() }) + "\\n");
const events = [
  { type: "system", subtype: "init", session_id: "cur-session-1", model: "Auto", cwd: process.cwd() },
  { type: "user", message: { role: "user", content: [{ type: "text", text: process.argv.slice(2).join(" ") }] }, session_id: "cur-session-1" },
  { type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "I will edit the file." }] }, session_id: "cur-session-1" },
  { type: "tool_call", subtype: "started", call_id: "call-1", tool_call: { readToolCall: { args: { path: "README.md" } } }, session_id: "cur-session-1" },
  { type: "tool_call", subtype: "completed", call_id: "call-1", tool_call: { readToolCall: { args: { path: "README.md" }, result: { success: { content: "# Project" } } } }, session_id: "cur-session-1" },
  { type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "Done." }] }, session_id: "cur-session-1" },
  { type: "result", subtype: "success", is_error: false, duration_ms: 42, result: "Done.", session_id: "cur-session-1" },
  "a partial line that is not json"
];
for (const ev of events) {
  process.stdout.write((typeof ev === "string" ? ev : JSON.stringify(ev)) + "\\n");
}
`;

interface SpawnRecord {
  bin: string;
  args: string[];
  cwd: string;
}

function makeFixture(body = FAKE_CURSOR): { bin: string; log: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-cursor-"));
  const bin = join(root, "bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "cursor-agent"), body, { mode: 0o755 });
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
  id: "0398",
  title: "Cursor driver",
  type: "feature",
  status: "ready",
  priority: "p1",
  area: "agent",
  assignee: "ai",
  assignedTo: "ai",
  createdBy: "",
  branch: "feat/cursor",
  tags: [],
  needsInput: false,
  needsMerge: false,
  noSourceChange: false,
  created_at: null,
  updated_at: null,
  path: "work/0398-cursor.md",
  absPath: "/tmp/work/0398-cursor.md",
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

const agent = (model: string): Agent => ({
  name: "engineer",
  cli: "cursor",
  model,
  enabled: true,
});

function spawns(fx: { log: string }): SpawnRecord[] {
  const text = readFileSync(fx.log, "utf8").trim();
  if (!text) return [];
  return text.split("\n").map((l) => JSON.parse(l) as SpawnRecord);
}

afterEach(() => {
  delete process.env.REPOOS_FAKEBIN_LOG;
});

describe("cursor driver (stream-json events)", () => {
  it("spawns cursor-agent, parses entries, and resumes the captured session", async () => {
    const fx = makeFixture();
    const oldPath = withFakePath(fx);
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    try {
      const runner = new AgentRunner(config(fx.bin), () => {});
      const cwd = join(fx.bin, "wt", "cursor");
      mkdirSync(cwd, { recursive: true });
      const start = runner.start(TASK, "feat/cursor", agent("gpt-5.3-codex"), { cwd });
      expect(start.ok).toBe(true);

      await waitFor(() => !runner.isRunning("0398"), "cursor first-turn exit");

      const lines = runner.output("0398")!.lines;
      expect(lines).toEqual([
        { type: "text", text: "I will edit the file.", at: expect.any(String) },
        {
          type: "tool",
          tool: "read",
          input: "README.md",
          output: "# Project",
          state: "completed",
          at: expect.any(String),
        },
        { type: "text", text: "Done.", at: expect.any(String) },
        { s: "out", d: "a partial line that is not json", at: expect.any(String) },
      ]);
      expect(runner.output("0398")!.sessionId).toBe("cur-session-1");

      const [run] = spawns(fx);
      // Explicit binary, never a bare `agent`.
      expect(run.bin.endsWith("cursor-agent")).toBe(true);
      expect(run.args).not.toContain("agent");
      expect(run.args[0]).toBe("-p");
      expect(run.args).toEqual(expect.arrayContaining(["--output-format", "stream-json"]));
      expect(run.args).toEqual(expect.arrayContaining(["--workspace", cwd]));
      expect(run.args).toContain("--force");
      expect(run.args).toContain("--trust");
      expect(run.args).toEqual(expect.arrayContaining(["--model", "gpt-5.3-codex"]));
      expect(run.cwd).toBe(realpathSync(cwd));

      const resumed = runner.send("0398", "continue the work", agent("gpt-5.3-codex"));
      expect(resumed.ok).toBe(true);
      await waitFor(() => spawns(fx).length === 2, "cursor resume spawn");
      await waitFor(() => !runner.isRunning("0398"), "resume turn exit");

      const [, resume] = spawns(fx);
      expect(resume.args).toEqual(expect.arrayContaining(["--resume", "cur-session-1"]));
      expect(resume.args).not.toContain("--continue");
    } finally {
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      fx.clean();
    }
  });

  it("omits --model when the configured model is `default`", async () => {
    const fx = makeFixture();
    const oldPath = withFakePath(fx);
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    try {
      const runner = new AgentRunner(config(fx.bin), () => {});
      runner.start(TASK, "feat/cursor", agent("default"), { cwd: fx.bin });
      await waitFor(() => !runner.isRunning("0398"), "cursor default-model exit");
      const [run] = spawns(fx);
      expect(run.args).not.toContain("--model");
    } finally {
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      fx.clean();
    }
  });

  it("surfaces an actionable auth hint from stderr", async () => {
    const fx = makeFixture(`#!/usr/bin/env node
process.stderr.write("Error: not authenticated. Please run login.\\n");
process.exit(1);
`);
    const oldPath = withFakePath(fx);
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    try {
      const runner = new AgentRunner(config(fx.bin), () => {});
      runner.start(TASK, "feat/cursor", agent("default"), { cwd: fx.bin });
      await waitFor(() => !runner.isRunning("0398"), "cursor auth-fail exit");
      const hints = runner
        .output("0398")!
        .lines.filter((l) => "type" in l && l.type === "sys" && l.d.includes("cursor-agent login"));
      expect(hints.length).toBe(1);
    } finally {
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      fx.clean();
    }
  });

  it("does not resume without a captured session (starts a fresh turn)", async () => {
    const fx = makeFixture(`#!/usr/bin/env node
const fs = require("fs");
fs.appendFileSync(process.env.REPOOS_FAKEBIN_LOG, JSON.stringify({ bin: process.argv[1], args: process.argv.slice(2), cwd: process.cwd() }) + "\\n");
process.stdout.write(JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "hi" }] }, session_id: "ignored" }) + "\\n");
`);
    const oldPath = withFakePath(fx);
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    try {
      const runner = new AgentRunner(config(fx.bin), () => {});
      runner.start(TASK, "feat/cursor", agent("default"), { cwd: fx.bin });
      await waitFor(() => !runner.isRunning("0398"), "cursor no-id exit");
      // Force the id away to simulate an expired/missing session.
      const session = runner.output("0398")!;
      session.sessionId = undefined;
      runner.send("0398", "next", agent("default"));
      await waitFor(() => spawns(fx).length === 2, "cursor fresh resume spawn");
      await waitFor(() => !runner.isRunning("0398"), "fresh turn exit");
      const [, resume] = spawns(fx);
      expect(resume.args).not.toContain("--resume");
    } finally {
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      fx.clean();
    }
  });
});

describe("cursor detection", () => {
  const CURSOR_ONLY: KnownAgent[] = [
    {
      id: "cursor",
      name: "cursor agent",
      binary: "cursor-agent",
      drivable: true,
      installHint: "curl https://cursor.com/install -fsS | bash",
      authHint: "cursor-agent login",
      authCheckArgs: ["status", "--format", "json"],
    },
  ];

  it("reports auth state from the CLI's JSON status probe", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-cursor-detect-"));
    const bin = join(root, "bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(
      join(bin, "cursor-agent"),
      `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === "--version") { process.stdout.write("2026.09.15\\n"); process.exit(0); }
if (args[0] === "status") { process.stdout.write(JSON.stringify({ status: "authenticated", isAuthenticated: true }) + "\\n"); process.exit(0); }
process.exit(0);
`,
      { mode: 0o755 },
    );
    try {
      const rows = await detectAgents({ pathEnv: bin, agents: CURSOR_ONLY });
      expect(rows[0]).toMatchObject({
        id: "cursor",
        binary: "cursor-agent",
        installed: true,
        auth: true,
        drivable: true,
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports installed-but-unauthenticated when the status probe says so", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-cursor-detect-"));
    const bin = join(root, "bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(
      join(bin, "cursor-agent"),
      `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === "--version") { process.stdout.write("2026.09.15\\n"); process.exit(0); }
process.stdout.write(JSON.stringify({ isAuthenticated: false }) + "\\n");
`,
      { mode: 0o755 },
    );
    try {
      const rows = await detectAgents({ pathEnv: bin, agents: CURSOR_ONLY });
      expect(rows[0].auth).toBe(false);
      expect(rows[0].authHint).toBe("cursor-agent login");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("never resolves a bare `agent` binary for cursor", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-cursor-detect-"));
    const bin = join(root, "bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, "agent"), "#!/bin/sh\necho should-not-run\n", { mode: 0o755 });
    try {
      const rows = await detectAgents({ pathEnv: bin, agents: CURSOR_ONLY });
      expect(rows[0].installed).toBe(false);
      expect(rows[0].path).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("cursor model source", () => {
  it("spawns `cursor-agent --list-models` and offers default + live models", async () => {
    const fx = makeFixture(`#!/usr/bin/env node
const fs = require("fs");
fs.appendFileSync(process.env.REPOOS_FAKEBIN_LOG, JSON.stringify({ bin: process.argv[1], args: process.argv.slice(2), cwd: process.cwd() }) + "\\n");
process.stdout.write("Available models\\n\\nauto - Auto (current, default)\\ngpt-5.3-codex - Codex 5.3\\n");
`);
    const oldPath = withFakePath(fx);
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    try {
      const res = await MODEL_SOURCES.cursor.list({ cwd: fx.bin });
      expect(res).toEqual({
        supported: true,
        models: ["default", "auto", "gpt-5.3-codex"],
        refreshable: true,
      });
      const [call] = spawns(fx);
      expect(call.bin.endsWith("cursor-agent")).toBe(true);
      expect(call.args).toEqual(["--list-models"]);
    } finally {
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      fx.clean();
    }
  });
});
