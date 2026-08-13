/**
 * Fixture E2E for the qwen code / codex drivers (0043 P2). Fake `qwen` and
 * `codex` binaries on a fixture PATH record their argv + cwd to a log file, so
 * we can assert spawn args, streaming, session-id capture, and resume args —
 * without touching a real coding agent.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner, extractUsage, HANDOFF_READY_SIGNAL, PREVIEW_REQUEST_SIGNAL, promptCommand, runPrompt } from "../../server/agents";
import type { Agent, AgentOutputEntry, RepoOSConfig, Task } from "../../core/types";
import { waitFor } from "./helpers";

/** Plain-line text of an entry (legacy `{s,d}` or sys) — narrows the union. */
const dOf = (entry: AgentOutputEntry): string | undefined =>
  (entry as { d?: string }).d;

const FAKEBIN = `#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.REPOOS_FAKEBIN_LOG, JSON.stringify({ args, cwd: process.cwd(), agent: process.env.REPOOS_AGENT || "", task: process.env.REPOOS_TASK_ID || "", api: process.env.REPOOS_API_URL || "" }) + "\\n");
if (path.basename(process.argv[1]) === "copilot") {
  process.stdout.write(JSON.stringify({ type: "assistant.message", data: { content: "Copilot response" } }) + "\\n");
  process.stdout.write(JSON.stringify({ type: "tool.execution_complete", data: { toolName: "shell", arguments: { command: "git status" }, result: "clean" } }) + "\\n");
  process.stdout.write(JSON.stringify({ type: "result", sessionId: "copilot-session-123" }) + "\\n");
  process.exit(0);
}
const resumeIndex = args.indexOf("resume");
if (path.basename(process.argv[1]) === "codex" && resumeIndex !== -1) {
  const sandboxIndex = args.indexOf("--sandbox");
  if (sandboxIndex > resumeIndex) {
    process.stderr.write("error: unexpected argument '--sandbox' found\\n");
    process.exit(2);
  }
  process.stdout.write("received resume prompt: " + args.at(-1) + "\\n");
}
process.stdout.write("fake output line\\n");
if (process.env.REPOOS_FAKEBIN_EMIT_SESSION !== "0") process.stdout.write('{"session_id":"sess-123"}\\n');
process.stdout.write("done\\n");
if (process.env.REPOOS_FAKEBIN_HANDOFF === "1") process.stdout.write("${HANDOFF_READY_SIGNAL}\\n");
if (process.env.REPOOS_FAKEBIN_CODEX_HANDOFF === "1") process.stdout.write(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "Finished.\\n\\n${HANDOFF_READY_SIGNAL}" } }) + "\\n");
if (process.env.REPOOS_FAKEBIN_OPENCODE_HANDOFF === "1") process.stdout.write(JSON.stringify({ type: "text", sessionID: "sess-123", part: { type: "text", text: "Finished.\\n\\n${HANDOFF_READY_SIGNAL}" } }) + "\\n");
if (process.env.REPOOS_FAKEBIN_FAIL === "1") process.exitCode = 1;
`;

interface SpawnRecord {
  args: string[];
  cwd: string;
  /** REPOOS_AGENT marker — "1" when the runner stamped this managed agent. */
  agent?: string;
  /** REPOOS_TASK_ID marker injected by the runner. */
  task?: string;
  /** REPOOS_API_URL — the actual control-plane URL injected by the runner. */
  api?: string;
}

interface Fixture {
  bin: string;
  log: string;
  clean: () => void;
}

function makeFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), "repoos-drivers-"));
  const bin = join(root, "bin");
  mkdirSync(bin, { recursive: true });
  for (const name of ["qwen", "codex", "claude", "opencode", "copilot"]) {
    writeFileSync(join(bin, name), FAKEBIN, { mode: 0o755 });
  }
  return {
    bin,
    log: join(root, "spawns.log"),
    clean: () => rmSync(root, { recursive: true, force: true }),
  };
}

/** Prepend the fixture bin dir to PATH so fakebins win but `env node` works. */
function withFakePath(fx: Fixture): string {
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
  id: "0001",
  title: "Test task",
  type: "feature",
  status: "ready",
  priority: "p2",
  area: "web",
  assignee: "ai",
  assignedTo: "ai",
  createdBy: "",
  branch: "feat/x",
  tags: [],
  needsInput: false,
  needsMerge: false,
  created_at: null,
  updated_at: null,
  path: "work/0001-test.md",
  absPath: "/tmp/work/0001-test.md",
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

const agent = (cli: string): Agent => ({ name: "engineer", cli, model: "default", enabled: true });

function spawns(fx: Fixture): SpawnRecord[] {
  const text = readFileSync(fx.log, "utf8").trim();
  if (!text) return [];
  return text.split("\n").map((l) => JSON.parse(l) as SpawnRecord);
}

function expectCodexExecOptionsBeforeResume(args: string[]): void {
  const resumeIndex = args.indexOf("resume");
  expect(resumeIndex).toBeGreaterThan(0);
  expect(args.indexOf("--sandbox")).toBeLessThan(resumeIndex);
}

afterEach(() => {
  delete process.env.REPOOS_FAKEBIN_EMIT_SESSION;
  delete process.env.REPOOS_FAKEBIN_HANDOFF;
  delete process.env.REPOOS_FAKEBIN_CODEX_HANDOFF;
  delete process.env.REPOOS_FAKEBIN_OPENCODE_HANDOFF;
  delete process.env.REPOOS_FAKEBIN_FAIL;
});

describe("model-aware driver commands", () => {
  it.each([
    ["opencode", "opencode"],
    ["claude code", "claude"],
    ["qwen code", "qwen"],
    ["codex", "codex"],
    ["github copilot", "copilot"],
  ])("forwards an explicit model for %s", (cli, binary) => {
    const command = promptCommand({ ...agent(cli), model: "provider/model-x" }, "ping");
    expect(command.cmd).toBe(binary);
    expect(command.args).toEqual(expect.arrayContaining(["--model", "provider/model-x"]));
  });

  it.each(["opencode", "claude code", "qwen code", "codex", "github copilot"])(
    "omits the model flag for %s default",
    (cli) => {
      const command = promptCommand({ ...agent(cli), model: "default" }, "ping");
      expect(command.args).not.toContain("--model");
    },
  );

  it("keeps Copilot one-shot prompts as markdown for freeform task creation", () => {
    const command = promptCommand(agent("github copilot"), "write a task file");
    expect(command).toEqual({
      cmd: "copilot",
      args: expect.arrayContaining(["-p", "write a task file", "--no-ask-user"]),
    });
    expect(command.args).not.toContain("--output-format");
  });
});

describe("qwen code driver", () => {
  it("spawns headless args, streams output, and resumes by session id", async () => {
    const fx = makeFixture();
    const oldPath = withFakePath(fx);
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    try {
      const runner = new AgentRunner(config(fx.bin), () => {});
      const cwd = join(fx.bin, "wt", "qwen");
      mkdirSync(cwd, { recursive: true });
      const start = runner.start(TASK, "feat/x", agent("qwen code"), { cwd });
      expect(start.ok).toBe(true);

      await waitFor(() => runner.output("0001")?.lines.length === 3, "qwen first-turn output");
      const lines = runner.output("0001")!.lines;
      expect(lines.map(dOf)).toContain("fake output line");
      expect(lines.map(dOf)).toContain('{"session_id":"sess-123"}');
      expect(runner.output("0001")!.sessionId).toBe("sess-123");

      const [run] = spawns(fx);
      expect(run.args[0]).toBe("-p");
      expect(run.args[1]).toContain("Task #0001");
      expect(run.args).toEqual(
        expect.arrayContaining(["--output-format", "stream-json"]),
      );

      await waitFor(() => !runner.isRunning("0001"), "first turn exit");
      const resumed = runner.send("0001", "continue the work", agent("qwen code"));
      expect(resumed.ok).toBe(true);
      await waitFor(() => spawns(fx).length === 2, "qwen resume spawn");
      await waitFor(() => !runner.isRunning("0001"), "resume turn exit");

      const [, resume] = spawns(fx);
      expect(resume.args).toEqual([
        "--resume",
        "sess-123",
        "-p",
        "continue the work",
        "--output-format",
        "stream-json",
        "--include-partial-messages",
      ]);
      expect(resume.cwd).toBe(realpathSync(cwd));
    } finally {
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      fx.clean();
    }
  });

  it("degrades to --continue when no session id is known", async () => {
    const fx = makeFixture();
    const oldPath = withFakePath(fx);
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    process.env.REPOOS_FAKEBIN_EMIT_SESSION = "0";
    try {
      const runner = new AgentRunner(config(fx.bin), () => {});
      runner.start(TASK, "feat/x", agent("qwen code"), { cwd: fx.bin });
      await waitFor(() => !runner.isRunning("0001"), "qwen no-id turn exit");

      runner.send("0001", "keep going", agent("qwen code"));
      await waitFor(() => spawns(fx).length === 2, "qwen continue spawn");

      const [, resume] = spawns(fx);
      expect(resume.args).toEqual([
        "--continue",
        "-p",
        "keep going",
        "--output-format",
        "stream-json",
        "--include-partial-messages",
      ]);
    } finally {
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      fx.clean();
    }
  });
});

describe("codex driver", () => {
  it("sends and streams a follow-up using a known session id", async () => {
    const fx = makeFixture();
    const oldPath = withFakePath(fx);
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    try {
      const runner = new AgentRunner(config(fx.bin), () => {});
      const cwd = join(fx.bin, "wt", "codex");
      mkdirSync(cwd, { recursive: true });
      const start = runner.start(TASK, "feat/x", agent("codex"), { cwd });
      expect(start.ok).toBe(true);

      await waitFor(() => runner.output("0001")?.lines.length === 3, "codex first-turn output");
      expect(runner.output("0001")!.lines.map(dOf)).toContain("fake output line");
      expect(runner.output("0001")!.sessionId).toBe("sess-123");

      const [run] = spawns(fx);
      expect(run.args[0]).toBe("exec");
      expect(run.args[1]).toContain("Task #0001");
      expect(run.args).toEqual(
        expect.arrayContaining(["--json", "--sandbox", "workspace-write"]),
      );

      await waitFor(() => !runner.isRunning("0001"), "first turn exit");
      runner.send("0001", "continue the work", { ...agent("codex"), model: "gpt-5.6" });
      await waitFor(() => spawns(fx).length === 2, "codex resume spawn");
      await waitFor(() => !runner.isRunning("0001"), "resume turn exit");

      const [, resume] = spawns(fx);
      expect(resume.args).toEqual([
        "exec",
        "--sandbox",
        "workspace-write",
        "resume",
        "--model",
        "gpt-5.6",
        "--json",
        "sess-123",
        "continue the work",
      ]);
      expectCodexExecOptionsBeforeResume(resume.args);
      expect(resume.args.filter((arg) => arg === "sess-123")).toHaveLength(1);
      expect(resume.cwd).toBe(realpathSync(cwd));
      expect(runner.output("0001")!.lines.map(dOf)).toContain(
        "received resume prompt: continue the work",
      );
    } finally {
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      fx.clean();
    }
  });

  it("degrades to resume --last when no session id is known", async () => {
    const fx = makeFixture();
    const oldPath = withFakePath(fx);
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    process.env.REPOOS_FAKEBIN_EMIT_SESSION = "0";
    try {
      const runner = new AgentRunner(config(fx.bin), () => {});
      runner.start(TASK, "feat/x", agent("codex"), { cwd: fx.bin });
      await waitFor(() => !runner.isRunning("0001"), "codex no-id turn exit");

      runner.send("0001", "keep going", agent("codex"));
      await waitFor(() => spawns(fx).length === 2, "codex resume --last spawn");

      const [, resume] = spawns(fx);
      expect(resume.args).toEqual([
        "exec",
        "--sandbox",
        "workspace-write",
        "resume",
        "--json",
        "--last",
        "keep going",
      ]);
      expectCodexExecOptionsBeforeResume(resume.args);
      expect(resume.args.filter((arg) => arg === "--last")).toHaveLength(1);
      expect(resume.args).not.toContain("--model");
    } finally {
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      fx.clean();
    }
  });
});

describe("claude code driver", () => {
  /**
   * The permission flag is load-bearing: agents are spawned with stdin ignored,
   * so an approval prompt can never reach a human. Without it claude denies
   * every write and build command, does nothing, and leaves the task wedged in
   * `active` — the exact failure this asserts against.
   */
  it("passes stream-json + --verbose and --dangerously-skip-permissions on both first turn and resume", async () => {
    const fx = makeFixture();
    const oldPath = withFakePath(fx);
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    try {
      const runner = new AgentRunner(config(fx.bin), () => {});
      const cwd = join(fx.bin, "wt", "claude");
      mkdirSync(cwd, { recursive: true });
      const start = runner.start(TASK, "feat/x", agent("claude code"), { cwd });
      expect(start.ok).toBe(true);

      await waitFor(() => runner.output("0001")?.lines.length === 3, "claude first-turn output");
      const [run] = spawns(fx);
      expect(run.args[0]).toBe("-p");
      expect(run.args[1]).toContain("Task #0001");
      expect(run.args).toContain("--dangerously-skip-permissions");
      // stream-json un-buffers stdout so the Agent tab fills in live instead of
      // blank until exit (0109); --verbose is required alongside it in print mode.
      expect(run.args).toEqual(expect.arrayContaining(["--output-format", "stream-json"]));
      expect(run.args).toContain("--verbose");

      await waitFor(() => !runner.isRunning("0001"), "first turn exit");
      runner.send("0001", "keep going", agent("claude code"));
      await waitFor(() => spawns(fx).length === 2, "claude resume spawn");

      const [, resume] = spawns(fx);
      expect(resume.args).toContain("keep going");
      expect(resume.args).toContain("--dangerously-skip-permissions");
      expect(resume.args).toEqual(expect.arrayContaining(["--output-format", "stream-json"]));
      expect(resume.args).toContain("--verbose");
    } finally {
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      fx.clean();
    }
  });

  describe("GitHub Copilot CLI driver", () => {
    it("uses JSONL, narrow permissions, and an extracted session id for resume", async () => {
      const fx = makeFixture();
      const oldPath = withFakePath(fx);
      process.env.REPOOS_FAKEBIN_LOG = fx.log;
      try {
        const runner = new AgentRunner(config(fx.bin), () => {});
        const cwd = join(fx.bin, "wt", "copilot");
        mkdirSync(cwd, { recursive: true });
        runner.start(TASK, "feat/x", agent("github copilot"), { cwd });
        await waitFor(() => !runner.isRunning("0001"), "Copilot first-turn exit");

        expect(runner.output("0001")!.sessionId).toBe("copilot-session-123");
        expect(runner.output("0001")!.lines).toEqual(expect.arrayContaining([
          { type: "text", text: "Copilot response" },
          { type: "tool", tool: "shell", input: "git status", output: "clean", state: "completed" },
        ]));
        const [run] = spawns(fx);
        expect(run.args).toEqual(expect.arrayContaining([
          "-p", "--output-format", "json", "--no-ask-user",
          "--allow-tool", "write", "shell(git:*)",
        ]));
        expect(run.args).not.toEqual(expect.arrayContaining(["--allow-all", "--allow-all-tools", "--yolo"]));
        expect(run.cwd).toBe(realpathSync(cwd));

        runner.send("0001", "continue the work", agent("github copilot"));
        await waitFor(() => spawns(fx).length === 2, "Copilot resume spawn");
        const [, resume] = spawns(fx);
        expect(resume.args).toEqual(expect.arrayContaining([
          "-p", "continue the work", "--resume=copilot-session-123", "--output-format", "json",
        ]));
      } finally {
        process.env.PATH = oldPath;
        delete process.env.REPOOS_FAKEBIN_LOG;
        fx.clean();
      }
    });
  });
});

describe("runPrompt live streaming (0049)", () => {
  /**
   * `runPrompt` drives the freeform PM agent. Its `onLine` hook is what lets
   * the drawer stream the PM agent's output live over SSE instead of showing
   * a static "saving" — these assertions keep that contract intact.
   */
  it("calls onLine per stdout line as it arrives, before the run resolves", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-runprompt-"));
    const bin = join(root, "bin");
    mkdirSync(bin, { recursive: true });
    const streamingBin = `#!/usr/bin/env node
const fs = require("fs");
fs.appendFileSync(process.env.REPOOS_FAKEBIN_LOG, JSON.stringify({ args: process.argv.slice(2) }) + "\\n");
const lines = ["line one", "line two", "line three"];
let i = 0;
const tick = () => {
  if (i < lines.length) {
    process.stdout.write(lines[i++] + "\\n");
    setTimeout(tick, 40);
  }
};
tick();
`;
    writeFileSync(join(bin, "opencode"), streamingBin, { mode: 0o755 });
    const log = join(root, "spawns.log");
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${bin}:${oldPath}`;
    process.env.REPOOS_FAKEBIN_LOG = log;
    try {
      const seen: string[] = [];
      let resolved = false;
      const result = await runPrompt(agent("opencode"), "ping", {
        cwd: bin,
        onLine: (line) => {
          seen.push(line);
          // The line arrives BEFORE the promise resolves — that is what makes
          // the freeform drawer's live stream live rather than a replay.
          expect(resolved).toBe(false);
        },
      });
      resolved = true;
      expect(result.ok).toBe(true);
      expect(result.output).toBe("line one\nline two\nline three");
      expect(seen).toEqual(["line one", "line two", "line three"]);
    } finally {
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("flushes a trailing partial line with no final newline", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-runprompt-"));
    const bin = join(root, "bin");
    mkdirSync(bin, { recursive: true });
    const trailingBin = `#!/usr/bin/env node
const fs = require("fs");
fs.appendFileSync(process.env.REPOOS_FAKEBIN_LOG, JSON.stringify({ args: process.argv.slice(2) }) + "\\n");
process.stdout.write("partial-no-newline");
`;
    writeFileSync(join(bin, "opencode"), trailingBin, { mode: 0o755 });
    const log = join(root, "spawns.log");
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${bin}:${oldPath}`;
    process.env.REPOOS_FAKEBIN_LOG = log;
    try {
      const seen: string[] = [];
      const result = await runPrompt(agent("opencode"), "ping", {
        cwd: bin,
        onLine: (line) => seen.push(line),
      });
      expect(result.ok).toBe(true);
      expect(result.output).toBe("partial-no-newline");
      expect(seen).toEqual(["partial-no-newline"]);
    } finally {
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not stream anything when no onLine hook is given", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-runprompt-"));
    const bin = join(root, "bin");
    mkdirSync(bin, { recursive: true });
    const plainBin = `#!/usr/bin/env node
const fs = require("fs");
fs.appendFileSync(process.env.REPOOS_FAKEBIN_LOG, JSON.stringify({ args: process.argv.slice(2) }) + "\\n");
process.stdout.write("plain answer\\n");
`;
    writeFileSync(join(bin, "opencode"), plainBin, { mode: 0o755 });
    const log = join(root, "spawns.log");
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${bin}:${oldPath}`;
    process.env.REPOOS_FAKEBIN_LOG = log;
    try {
      const result = await runPrompt(agent("opencode"), "ping", { cwd: bin });
      expect(result.ok).toBe(true);
      expect(result.output).toBe("plain answer");
    } finally {
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("strips ANSI escape sequences from agent output (0155)", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-runprompt-ansi-"));
    const bin = join(root, "bin");
    mkdirSync(bin, { recursive: true });
    // Simulate kiro-cli output with ANSI SGR codes and box-drawing characters.
    const ansiBin = `#!/usr/bin/env node
const fs = require("fs");
fs.appendFileSync(process.env.REPOOS_FAKEBIN_LOG, JSON.stringify({ args: process.argv.slice(2) }) + "\\n");
// Simulates kiro-cli rendering with ANSI colors and box-drawing delimiter
process.stdout.write("\\x1b[38;5;141m> \\x1b[0m━━━━━━━━━━━━━━━━\\n");
process.stdout.write("id: \\"0001\\"\\x1b[0m\\n");
process.stdout.write("title: Test task\\x1b[0m\\n");
process.stdout.write("type: feature\\x1b[0m\\n");
process.stdout.write("\\x1b[38;5;141m> \\x1b[0m━━━━━━━━━━━━━━━━\\n");
process.stdout.write("\\n");
process.stdout.write("\\x1b[38;5;252m\\x1b[1m## Problem\\x1b[0m\\n");
process.stdout.write("Test problem description\\x1b[0m\\n");
`;
    writeFileSync(join(bin, "opencode"), ansiBin, { mode: 0o755 });
    const log = join(root, "spawns.log");
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${bin}:${oldPath}`;
    process.env.REPOOS_FAKEBIN_LOG = log;
    try {
      const result = await runPrompt(agent("opencode"), "test", { cwd: bin });
      expect(result.ok).toBe(true);
      // Verify ANSI codes are stripped but box-drawing characters remain.
      expect(result.output).not.toContain("\x1b");
      expect(result.output).toContain("> ━━━━━━━━━━━━━━━━");
      expect(result.output).toContain("id: \"0001\"");
      expect(result.output).toContain("## Problem");
      expect(result.output).not.toContain("[38;5;141m");
      expect(result.output).not.toContain("[0m");
    } finally {
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("server-owned handoff mission (#0094)", () => {
  /**
   * The launch mission must be a literal, verifiable checklist so an agent
   * cannot silently drop the both-copies status sync (the #0063 failure) or
   * leave the task `active` without signalling that it is waiting on the
   * human. These assertions keep the two load-bearing instructions in the
   * mission text so future rewrites can't silently remove them.
   */
  it("keeps privileged mutations out of the sandbox and specifies one signal", async () => {
    const fx = makeFixture();
    const oldPath = withFakePath(fx);
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    try {
      const runner = new AgentRunner(config(fx.bin), () => {});
      runner.start(TASK, "feat/x", agent("claude code"), { cwd: fx.bin });
      await waitFor(() => !runner.isRunning("0001"), "mission fixture turn exit");

      const [run] = spawns(fx);
      const mission = run.args[1];
      expect(mission).toContain("Task #0001");
      expect(mission).toContain("Do not run git add/commit");
      expect(mission).toContain("do not edit the main checkout");
      expect(mission).toContain("commits only source, work, docs, and config files");
      expect(mission).toContain("never `dist/` or `screenshots/`");
      expect(mission).toContain("build artifacts created by `repoos check` stay local");
      expect(mission).toContain(HANDOFF_READY_SIGNAL);
      expect(mission).toContain("RepoOS will independently run `repoos check`");
      expect(mission).toContain("do NOT emit the handoff-ready signal");
    } finally {
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      fx.clean();
    }
  });
});

describe("structured runner handoff (#0094)", () => {
  it("recognizes the handoff signal inside a multiline OpenCode text event", async () => {
    const fx = makeFixture();
    const oldPath = withFakePath(fx);
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    process.env.REPOOS_FAKEBIN_OPENCODE_HANDOFF = "1";
    try {
      const requests: unknown[] = [];
      const runner = new AgentRunner(config(fx.bin), () => {}, {
        onHandoff: (request) => { requests.push(request); },
      });
      runner.start(TASK, "feat/x", agent("opencode"), { cwd: fx.bin });
      await waitFor(() => requests.length === 1, "OpenCode JSON handoff request");
    } finally {
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      fx.clean();
    }
  });

  it("recognizes the handoff signal inside a Codex JSON agent_message", async () => {
    const fx = makeFixture();
    const oldPath = withFakePath(fx);
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    process.env.REPOOS_FAKEBIN_CODEX_HANDOFF = "1";
    try {
      const requests: unknown[] = [];
      const runner = new AgentRunner(config(fx.bin), () => {}, {
        onHandoff: (request) => { requests.push(request); },
      });
      runner.start(TASK, "feat/x", agent("codex"), { cwd: fx.bin });
      await waitFor(() => requests.length === 1, "Codex JSON handoff request");
    } finally {
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      fx.clean();
    }
  });

  it("issues one scoped request after a successful initial or resumed turn", async () => {
    const fx = makeFixture();
    const oldPath = withFakePath(fx);
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    process.env.REPOOS_FAKEBIN_HANDOFF = "1";
    try {
      const requests: Array<{ taskId: string; runId: string; branch: string; workdir: string }> = [];
      const runner = new AgentRunner(config(fx.bin), () => {}, {
        onHandoff: (request) => { requests.push(request); },
      });
      runner.start(TASK, "feat/x", agent("codex"), { cwd: fx.bin });
      await waitFor(() => requests.length === 1, "initial handoff request");
      expect(requests[0]).toMatchObject({ taskId: "0001", branch: "feat/x", workdir: fx.bin });
      expect(requests[0].runId).toBeTruthy();
      expect(runner.validateHandoff(requests[0])).toBe(true);
      expect(runner.validateHandoff({ ...requests[0], runId: "forged-session" })).toBe(false);

      runner.send("0001", "finish the resumed turn", agent("codex"));
      await waitFor(() => requests.length === 2, "resumed handoff request");
      expect(requests[1].runId).not.toBe(requests[0].runId);
    } finally {
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      fx.clean();
    }
  });

  it("does not authorize a signal from an interrupted turn", async () => {
    const fx = makeFixture();
    const oldPath = withFakePath(fx);
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    process.env.REPOOS_FAKEBIN_HANDOFF = "1";
    process.env.REPOOS_FAKEBIN_FAIL = "1";
    try {
      const requests: unknown[] = [];
      const runner = new AgentRunner(config(fx.bin), () => {}, {
        onHandoff: (request) => { requests.push(request); },
      });
      runner.start(TASK, "feat/x", agent("codex"), { cwd: fx.bin });
      await waitFor(() => !runner.isRunning("0001"), "failed turn exit");
      expect(requests).toEqual([]);
      expect(runner.output("0001")!.lines.map(dOf)).toContain(
        "✗ handoff was not started because the agent turn was interrupted",
      );
    } finally {
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      fx.clean();
    }
  });
});

describe("server-owned previews in the mission and spawn env (#0096/#0121)", () => {
  /**
   * The launch mission must explicitly prohibit direct `repoos serve` / manual
   * port selection and provide ONE sandbox-compatible, task-scoped preview
   * request: the exact output signal (#0121) — never a localhost `curl` that a
   * sandboxed agent cannot reach. The spawn must carry the agent markers so
   * the CLI's defense in depth can reject an accidental direct serve, plus the
   * ACTUAL control-plane URL.
   */
  it("prohibits direct serve, instructs the preview signal, injects the real API URL and markers", async () => {
    const fx = makeFixture();
    const oldPath = withFakePath(fx);
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    try {
      const runner = new AgentRunner(config(fx.bin), () => {});
      runner.apiUrl = "http://127.0.0.1:7777";
      const cwd = join(fx.bin, "wt", "preview");
      mkdirSync(cwd, { recursive: true });
      runner.start(TASK, "feat/x", agent("claude code"), { cwd });
      await waitFor(() => !runner.isRunning("0001"), "mission fixture turn exit");

      const [run] = spawns(fx);
      const mission = run.args[1];
      // Prohibits direct serve and manual port selection.
      expect(mission).toContain("never run `repoos serve` yourself");
      expect(mission).toMatch(/do NOT launch `repoos serve` directly/i);
      // One sandbox-compatible, task-scoped preview request: the signal line.
      expect(mission).toContain(PREVIEW_REQUEST_SIGNAL);
      // The old mandatory localhost curl is gone from the mission — the signal
      // replaces it, so an agent is never told to reach the control plane.
      expect(mission).not.toContain('curl -s -X POST');
      expect(mission).not.toContain('"${REPOOS_API_URL}/api/tasks/${REPOOS_TASK_ID}/preview"');
      expect(mission).not.toContain("--port 7171");

      // Managed-agent markers on the spawn.
      expect(run.agent).toBe("1");
      expect(run.task).toBe("0001");
      expect(run.api).toBe("http://127.0.0.1:7777");

      // A follow-up turn stamps the same markers.
      runner.send("0001", "continue", agent("claude code"));
      await waitFor(() => spawns(fx).length === 2, "resume spawn with markers");
      const [, resume] = spawns(fx);
      expect(resume.agent).toBe("1");
      expect(resume.task).toBe("0001");
      expect(resume.api).toBe("http://127.0.0.1:7777");
    } finally {
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      fx.clean();
    }
  });
});

describe("extractUsage (0080)", () => {
  it("reads token/cost fields from a JSON usage payload", () => {
    expect(
      extractUsage(JSON.stringify({ usage: { input_tokens: 10, output_tokens: 5 }, total_cost_usd: 0.0021 })),
    ).toEqual({ tokens: 15, costUsd: 0.0021 });
  });

  it("reads a JSON total_tokens field directly", () => {
    expect(extractUsage(JSON.stringify({ total_tokens: 42 }))).toEqual({ tokens: 42 });
  });

  it("falls back to plain-text cost/token summaries", () => {
    expect(extractUsage("Total cost: $0.1234")).toEqual({ costUsd: 0.1234 });
    expect(extractUsage("used 1,234 tokens this turn")).toEqual({ tokens: 1234 });
  });

  it("reads claude's nested message.usage and authoritative result totals (0109)", () => {
    expect(
      extractUsage(
        JSON.stringify({
          type: "assistant",
          message: { content: [], usage: { input_tokens: 4, output_tokens: 91 } },
        }),
      ),
    ).toEqual({ tokens: 95 });
    // The terminal `result` reports the turn's authoritative numbers; the cache
    // fields bill at different rates and must NOT be summed into the headline.
    expect(
      extractUsage(
        JSON.stringify({
          type: "result",
          subtype: "success",
          is_error: false,
          total_cost_usd: 0.0731223,
          result: "Hello world greeting.",
          usage: {
            input_tokens: 4,
            output_tokens: 91,
            cache_creation_input_tokens: 9403,
            cache_read_input_tokens: 49071,
          },
        }),
      ),
    ).toEqual({ tokens: 95, costUsd: 0.0731223 });
  });

  it("returns an empty object when nothing usage-shaped is present", () => {
    expect(extractUsage("just a normal line of output")).toEqual({});
    expect(extractUsage(JSON.stringify({ type: "text", text: "hello" }))).toEqual({});
  });

  it("extracts kiro credits as costUsd from the stderr footer (#0148)", () => {
    // Kiro CLI emits " ▸ Credits: 0.15 • Time: 12s" on stderr after each turn.
    // Credits are Kiro's billing unit (not USD), mapped to costUsd for display.
    expect(extractUsage(" ▸ Credits: 0.15 • Time: 12s")).toEqual({ costUsd: 0.15 });
    expect(extractUsage(" ▸ Credits: 0.02 • Time: 2s")).toEqual({ costUsd: 0.02 });
    expect(extractUsage("▸ Credits: 1.00 • Time: 30s")).toEqual({ costUsd: 1.0 });
  });
});

describe("live run stats (0080)", () => {
  it("accumulates elapsed time across turns instead of resetting it", async () => {
    const fx = makeFixture();
    const oldPath = withFakePath(fx);
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    // A tiny delay before exit guarantees a non-zero, measurable turn duration.
    const slowBin = `#!/usr/bin/env node
const fs = require("fs");
fs.appendFileSync(process.env.REPOOS_FAKEBIN_LOG, JSON.stringify({ args: process.argv.slice(2) }) + "\\n");
process.stdout.write("line one\\n");
setTimeout(() => process.exit(0), 30);
`;
    writeFileSync(join(fx.bin, "claude"), slowBin, { mode: 0o755 });
    try {
      const runner = new AgentRunner(config(fx.bin), () => {});
      runner.start(TASK, "feat/x", agent("claude code"), { cwd: fx.bin });
      await waitFor(() => !runner.isRunning("0001"), "first turn exit");

      const afterFirst = runner.stats("0001");
      expect(afterFirst.accumulatedMs).toBeGreaterThan(0);
      expect(afterFirst.turnStartedAt).toBeNull();

      runner.send("0001", "continue", agent("claude code"));
      await waitFor(() => !runner.isRunning("0001"), "second turn exit");

      const afterSecond = runner.stats("0001");
      expect(afterSecond.accumulatedMs).toBeGreaterThanOrEqual(afterFirst.accumulatedMs);
      expect(afterSecond.turnStartedAt).toBeNull();
    } finally {
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      fx.clean();
    }
  });

  it("extracts and monotonically accumulates tokens/cost from live output", async () => {
    const fx = makeFixture();
    const oldPath = withFakePath(fx);
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    const usageBin = `#!/usr/bin/env node
const fs = require("fs");
fs.appendFileSync(process.env.REPOOS_FAKEBIN_LOG, JSON.stringify({ args: process.argv.slice(2) }) + "\\n");
process.stdout.write(JSON.stringify({ usage: { input_tokens: 10, output_tokens: 5 } }) + "\\n");
process.stdout.write(JSON.stringify({ usage: { input_tokens: 10, output_tokens: 5 }, total_cost_usd: 0.004 }) + "\\n");
`;
    writeFileSync(join(fx.bin, "codex"), usageBin, { mode: 0o755 });
    try {
      const runner = new AgentRunner(config(fx.bin), () => {});
      runner.start(TASK, "feat/x", agent("codex"), { cwd: fx.bin });
      await waitFor(() => !runner.isRunning("0001"), "usage turn exit");

      const stats = runner.stats("0001");
      expect(stats.tokens).toBe(15);
      expect(stats.costUsd).toBe(0.004);
    } finally {
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      fx.clean();
    }
  });

  it("has no session stats for a task that never started", () => {
    const runner = new AgentRunner(config("/tmp"), () => {});
    const stats = runner.stats("9999");
    expect(stats).toEqual({
      accumulatedMs: 0,
      turnStartedAt: null,
      lastOutputAt: null,
      tokens: null,
      costUsd: null,
      stalled: false,
    });
  });
});

describe("stall detection (0080)", () => {
  /**
   * Confirmed live on #0069/#0077: a process that stops emitting output but
   * hasn't exited must be flagged as POSSIBLY stalled (never "dead") — and the
   * flag must clear the instant new output arrives, since that's proof it was
   * only ever a slow step. A tiny `stallTimeoutMs` override keeps this test
   * fast instead of waiting on the real 90s default.
   */
  it("flags a silent-but-alive turn as stalled, then clears it when output resumes", async () => {
    const fx = makeFixture();
    const oldPath = withFakePath(fx);
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    const quietBin = `#!/usr/bin/env node
const fs = require("fs");
fs.appendFileSync(process.env.REPOOS_FAKEBIN_LOG, JSON.stringify({ args: process.argv.slice(2) }) + "\\n");
process.stdout.write("first line\\n");
setTimeout(() => {
  process.stdout.write("second line\\n");
  process.exit(0);
}, 300);
`;
    writeFileSync(join(fx.bin, "claude"), quietBin, { mode: 0o755 });
    try {
      const runner = new AgentRunner(config(fx.bin), () => {}, { stallTimeoutMs: 50 });
      runner.start(TASK, "feat/x", agent("claude code"), { cwd: fx.bin });

      await waitFor(() => runner.stats("0001").stalled === true, "stall flag raised", 2000);
      expect(runner.isRunning("0001")).toBe(true); // stalled is never "dead"

      await waitFor(() => runner.stats("0001").stalled === false, "stall flag cleared by output", 2000);
      await waitFor(() => !runner.isRunning("0001"), "turn exit");
      expect(runner.stats("0001").stalled).toBe(false);
    } finally {
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      fx.clean();
    }
  });

  it("clears the stall flag once the turn is confirmed exited", async () => {
    const fx = makeFixture();
    const oldPath = withFakePath(fx);
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    const hangBin = `#!/usr/bin/env node
const fs = require("fs");
fs.appendFileSync(process.env.REPOOS_FAKEBIN_LOG, JSON.stringify({ args: process.argv.slice(2) }) + "\\n");
process.stdout.write("only line\\n");
setTimeout(() => process.exit(0), 200);
`;
    writeFileSync(join(fx.bin, "claude"), hangBin, { mode: 0o755 });
    try {
      const runner = new AgentRunner(config(fx.bin), () => {}, { stallTimeoutMs: 50 });
      runner.start(TASK, "feat/x", agent("claude code"), { cwd: fx.bin });

      await waitFor(() => runner.stats("0001").stalled === true, "stall flag raised", 2000);
      await waitFor(() => !runner.isRunning("0001"), "process exits while still flagged");
      expect(runner.stats("0001").stalled).toBe(false);
      expect(runner.stats("0001").turnStartedAt).toBeNull();
    } finally {
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      fx.clean();
    }
  });
});
