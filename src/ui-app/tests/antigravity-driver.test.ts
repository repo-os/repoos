/** Fixture coverage for Google's documented Antigravity CLI (`agy`) driver. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import AgentsView from "../src/views/AgentsView.vue";
import { useConfigStore } from "../src/stores/config";
import { flush, json } from "./component-test-helpers";
import {
  AgentRunner,
  antigravityErrorHint,
  foldUsage,
  parseAntigravityEvent,
  promptCommand,
  runPrompt,
} from "../../server/agents";
import { detectAgents, KNOWN_AGENTS, type KnownAgent } from "../../core/detect";
import { MODEL_SOURCES, parseAntigravityModels } from "../../core/models";
import { AGENT_CLIS } from "../../core/config";
import type { Agent, RepoOSConfig, Task } from "../../core/types";
import { waitFor } from "./helpers";

describe("Antigravity stream-json protocol", () => {
  it("parses init, response, tool, terminal result, and usage without Gemini shapes", () => {
    expect(
      parseAntigravityEvent(
        JSON.stringify({
          event: "init",
          init: { conversation_id: "agy-1", model: "gemini-3.8-flash-medium" },
        }),
      ),
    ).toEqual({ sessionID: "agy-1", model: "gemini-3.8-flash-medium" });
    expect(
      parseAntigravityEvent(
        JSON.stringify({
          event: "step_update",
          step_update: {
            conversation_id: "agy-1",
            state: "ACTIVE",
            step_type: "agent_response",
            text_delta: "I will inspect the worktree.",
          },
        }),
      ),
    ).toEqual({
      sessionID: "agy-1",
      entry: { type: "text", text: "I will inspect the worktree." },
    });
    expect(
      parseAntigravityEvent(
        JSON.stringify({
          event: "step_update",
          step_update: {
            conversation_id: "agy-1",
            state: "DONE",
            step_type: "tool",
            tool_name: "run_command",
            tool_info: {
              name: "run_command",
              parameters: { CommandLine: "git status" },
              output: "clean",
            },
          },
        }),
      ),
    ).toEqual({
      sessionID: "agy-1",
      entry: {
        type: "tool",
        tool: "run_command",
        input: "git status",
        output: "clean",
        state: "completed",
      },
    });
    expect(
      parseAntigravityEvent(
        JSON.stringify({
          event: "result",
          result: {
            conversation_id: "agy-1",
            status: "SUCCESS",
            response: "Done.",
            duration_seconds: 0.2,
            num_turns: 1,
            usage: { input_tokens: 10, output_tokens: 4, total_tokens: 14 },
          },
        }),
      ),
    ).toEqual({
      sessionID: "agy-1",
      entry: {
        type: "step",
        kind: "finish",
        reason: "Antigravity result: SUCCESS · 0.20s · 1 turn",
      },
    });
  });

  it("turns malformed and unknown events into helpful system entries", () => {
    expect(parseAntigravityEvent("{not json")?.entry).toEqual({
      type: "sys",
      d: "Antigravity emitted malformed JSON; the event was ignored.",
    });
    expect(parseAntigravityEvent('{"event":"future_event"}')?.entry).toEqual({
      type: "sys",
      d: 'Antigravity emitted an unknown protocol event "future_event".',
    });
  });

  it("does not double-count cumulative usage from a resumed conversation", () => {
    const total: Parameters<typeof foldUsage>[0] = {};
    foldUsage(
      total,
      JSON.stringify({
        event: "result",
        result: {
          status: "SUCCESS",
          num_turns: 1,
          usage: { input_tokens: 10, output_tokens: 4, total_tokens: 14 },
        },
      }),
    );
    foldUsage(
      total,
      JSON.stringify({
        event: "result",
        result: {
          status: "SUCCESS",
          num_turns: 2,
          usage: { input_tokens: 18, output_tokens: 7, total_tokens: 25 },
        },
      }),
    );
    expect(total).toMatchObject({ inputTokens: 18, outputTokens: 7, totalTokens: 25 });
  });

  it("turns stderr failures into recovery guidance without exposing secrets", () => {
    expect(antigravityErrorHint("authentication required")).toContain("run `agy` once");
    expect(antigravityErrorHint("permission denied for command(git)")).toContain(
      "--dangerously-skip-permissions",
    );
    expect(antigravityErrorHint("invalid model selection")).toContain("agy models");
    expect(antigravityErrorHint("GEMINI_API_KEY=secret-value")).toBeNull();
  });

  it("renders a one-shot JSON envelope only when requested", () => {
    const line = JSON.stringify({
      conversation_id: "agy-2",
      status: "SUCCESS",
      response: "answer",
    });
    expect(parseAntigravityEvent(line)).toEqual({ sessionID: "agy-2" });
    expect(parseAntigravityEvent(line, { surfaceResult: true })).toEqual({
      sessionID: "agy-2",
      entry: { type: "text", text: "answer" },
    });
  });
});

describe("Antigravity discovery and commands", () => {
  it("keeps Gemini visible only as a deprecated, non-selectable migration row", () => {
    expect(KNOWN_AGENTS.find((agent) => agent.id === "gemini")).toMatchObject({
      deprecated: true,
      drivable: false,
      installHint: "Use Antigravity CLI (agy) instead.",
      migrationUrl: "https://antigravity.google/docs/cli/gcli-migration/",
    });
    expect(AGENT_CLIS).not.toContain("gemini");
  });

  it("parses documented model-table rows and drops diagnostics", () => {
    expect(
      parseAntigravityModels(
        "Available models\n\ngemini-3.8-flash-medium Gemini 3.8 Flash (Medium)\nclaude-sonnet-4-6 Claude Sonnet 4.6\nwarning: sign in required\n",
      ),
    ).toEqual(["gemini-3.8-flash-medium", "claude-sonnet-4-6"]);
  });

  it("uses only agy, passes a pinned model only when selected, and resumes exact conversations", () => {
    const pinned = promptCommand(
      { name: "engineer", cli: "antigravity", model: "gemini-x", enabled: true },
      "work",
    );
    expect(pinned).toEqual({
      cmd: "agy",
      args: ["-p", "work", "--model", "gemini-x", "--output-format", "json"],
    });
    const defaultModel = promptCommand(
      { name: "engineer", cli: "antigravity", model: "default", enabled: true },
      "work",
    );
    expect(defaultModel.args).not.toContain("--model");
    expect(() =>
      promptCommand({ name: "engineer", cli: "gemini", model: "default", enabled: true }, "work"),
    ).toThrow("Gemini CLI is deprecated");
    expect(AGENT_CLIS).toContain("antigravity");
  });
});

// Test-only fake binary: it uses Node so the fixture can exercise the CLI
// contract without requiring the real Antigravity installation.
const FAKE_AGY = `#!/usr/bin/env node
const fs = require("fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.REPOOS_FAKEBIN_LOG, JSON.stringify({ args, cwd: process.cwd() }) + "\\n");
if (args[0] === "--version") { process.stdout.write("agy 1.2.6\\n"); process.exit(0); }
if (args[0] === "models") { process.stdout.write("gemini-3.8-flash-medium Gemini 3.8 Flash\\nclaude-sonnet-4-6 Claude Sonnet\\n"); process.exit(0); }
if (args.includes("/model")) { process.stdout.write(JSON.stringify({ status: "SUCCESS", response: "models" }) + "\\n"); process.exit(0); }
if (args.includes("rejected-model")) {
  process.stdout.write(JSON.stringify({ status: "ERROR", error: "invalid model selection" }) + "\\n");
  process.stderr.write("invalid model selection\\n");
  process.exit(2);
}
if (process.env.REPOOS_FAKE_AGY_EXIT) {
  process.stdout.write(JSON.stringify({ status: "SUCCESS", response: "done" }) + "\\n");
  process.stderr.write("simulated non-zero exit\\n");
  process.exit(Number(process.env.REPOOS_FAKE_AGY_EXIT));
}
const id = "conversation-1";
const emit = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
emit({ event: "init", init: { conversation_id: id, cwd: process.cwd(), model: "fake-model" } });
emit({ event: "step_update", step_update: { conversation_id: id, state: "ACTIVE", step_type: "agent_response", text_delta: "working" } });
emit({ event: "step_update", step_update: { conversation_id: id, state: "DONE", step_type: "tool", tool_name: "run_command", tool_info: { name: "run_command", parameters: { CommandLine: "bun run test" }, output: "ok" } } });
emit({ event: "result", result: { conversation_id: id, status: "SUCCESS", response: "done", duration_seconds: 0.2, num_turns: 1, usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 } } });
`;

interface Fixture {
  bin: string;
  log: string;
  clean: () => void;
}

function fixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), "repoos-agy-"));
  const bin = join(root, "bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "agy"), FAKE_AGY, { mode: 0o755 });
  return {
    bin,
    log: join(root, "spawns.log"),
    clean: () => rmSync(root, { recursive: true, force: true }),
  };
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
  id: "0406",
  title: "Antigravity",
  type: "feature",
  status: "ready",
  priority: "p1",
  area: "agent",
  assignee: "ai",
  assignedTo: "ai",
  createdBy: "",
  branch: "feat/agy",
  tags: [],
  needsInput: false,
  needsMerge: false,
  noSourceChange: false,
  created_at: null,
  updated_at: null,
  path: "work/0406.md",
  absPath: "/tmp/work/0406.md",
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

const agent: Agent = { name: "engineer", cli: "antigravity", model: "default", enabled: true };

afterEach(() => {
  delete process.env.REPOOS_FAKEBIN_LOG;
  delete process.env.REPOOS_FAKE_AGY_EXIT;
  vi.unstubAllGlobals();
  localStorage.clear();
});

it("treats a non-zero one-shot exit as failure even with a SUCCESS envelope", async () => {
  const fx = fixture();
  const oldPath = process.env.PATH;
  process.env.PATH = `${fx.bin}:${oldPath ?? ""}`;
  process.env.REPOOS_FAKEBIN_LOG = fx.log;
  process.env.REPOOS_FAKE_AGY_EXIT = "7";
  try {
    const result = await runPrompt(agent, "write a task", { cwd: fx.bin, timeoutMs: 2_000 });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("agy exited with code 7");
  } finally {
    process.env.PATH = oldPath;
    delete process.env.REPOOS_FAKE_AGY_EXIT;
    fx.clean();
  }
});

it("surfaces the CLI diagnostic for a rejected Antigravity model pin", async () => {
  const fx = fixture();
  const oldPath = process.env.PATH;
  process.env.PATH = `${fx.bin}:${oldPath ?? ""}`;
  process.env.REPOOS_FAKEBIN_LOG = fx.log;
  try {
    const result = await runPrompt({ ...agent, model: "rejected-model" }, "write a task", {
      cwd: fx.bin,
      timeoutMs: 2_000,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("invalid model selection");
    expect(result.error).toContain("agy models");
  } finally {
    process.env.PATH = oldPath;
    fx.clean();
  }
});

it("detects auth, lists models, and runs/resumes in the exact task worktree", async () => {
  const fx = fixture();
  const oldPath = process.env.PATH;
  process.env.PATH = `${fx.bin}:${oldPath ?? ""}`;
  process.env.REPOOS_FAKEBIN_LOG = fx.log;
  const agyOnly: KnownAgent[] = [
    {
      id: "antigravity",
      name: "antigravity",
      cli: "antigravity",
      binary: "agy",
      drivable: true,
      installHint: "install",
      authCheckArgs: ["-p", "/model", "--output-format", "json"],
    },
  ];
  try {
    const rows = await detectAgents({ pathEnv: fx.bin, agents: agyOnly });
    expect(rows[0]).toMatchObject({
      installed: true,
      version: "agy 1.2.6",
      headless: true,
      auth: true,
      drivable: true,
    });
    const models = await MODEL_SOURCES.antigravity.list({ cwd: fx.bin });
    expect(models.models).toEqual(["default", "gemini-3.8-flash-medium", "claude-sonnet-4-6"]);
    const worktree = join(fx.bin, "worktree");
    mkdirSync(worktree, { recursive: true });
    const runner = new AgentRunner(config(fx.bin), () => {});
    expect(runner.start(TASK, "feat/agy", agent, { cwd: worktree }).ok).toBe(true);
    await waitFor(() => !runner.isRunning(TASK.id), "agy first turn");
    expect(runner.output(TASK.id)?.sessionId).toBe("conversation-1");
    expect(
      runner.output(TASK.id)?.lines.some((line) => "type" in line && line.type === "tool"),
    ).toBe(true);
    const runs = readFileSync(fx.log, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { args: string[]; cwd: string });
    const first = runs.find((run) => run.args.includes("stream-json"));
    expect(first?.cwd).toBe(realpathSync(worktree));
    expect(first?.args).toEqual(
      expect.arrayContaining([
        "-p",
        "--output-format",
        "stream-json",
        "--dangerously-skip-permissions",
      ]),
    );
    runner.send(TASK.id, "continue", agent);
    await waitFor(
      () => runs.length < readFileSync(fx.log, "utf8").trim().split("\n").length,
      "agy resume spawn",
    );
    const latest = readFileSync(fx.log, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { args: string[] });
    expect(latest.at(-1)?.args).toEqual(
      expect.arrayContaining(["--conversation", "conversation-1"]),
    );
    expect(
      runner.startChat("pm-chat", "hello", agent, "context", undefined, { cwd: worktree }).ok,
    ).toBe(true);
    await waitFor(() => !runner.isRunning("pm-chat"), "agy chat turn");
    const chatRun = readFileSync(fx.log, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { args: string[]; cwd: string })
      .find((run) => run.args.includes("--output-format") && run.args.includes("stream-json"));
    expect(chatRun?.cwd).toBe(realpathSync(worktree));
  } finally {
    process.env.PATH = oldPath;
    fx.clean();
  }
});

it("renders Gemini deprecation guidance and hides unavailable Antigravity selectors", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/api/agents/detect")) {
        return json({
          agents: [
            {
              id: "gemini",
              name: "Gemini CLI",
              binary: "gemini",
              installed: true,
              path: "/usr/local/bin/gemini",
              version: "gemini 1.0",
              headless: true,
              drivable: false,
              installHint: "Use Antigravity CLI (agy) instead.",
              deprecated: true,
              migrationUrl: "https://antigravity.google/docs/cli/gcli-migration/",
              migrationNote: "Enterprise and paid API-key Gemini CLI users may still have access.",
              auth: null,
            },
          ],
        });
      }
      if (url.includes("/api/models")) {
        return json({
          byCli: {
            opencode: { supported: true, models: ["default"], refreshable: false },
            antigravity: { supported: true, models: ["default"], refreshable: false },
          },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
  const pinia = createPinia();
  setActivePinia(pinia);
  const config = useConfigStore();
  const engineer = { name: "engineer", cli: "opencode", model: "default", enabled: true };
  config.agents = [engineer];
  config.agentsMeta = {
    clis: ["opencode", "antigravity"],
    models: ["default"],
    defaults: [engineer],
    skills: [],
  };
  config.loaded = true;
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/", component: { template: "<div />" } }],
  });
  await router.push("/");
  const wrapper = mount(AgentsView, {
    global: {
      plugins: [pinia, router],
      stubs: {
        teleport: true,
        Transition: true,
        AgentModelControl: {
          props: ["cliOptions", "cli"],
          template:
            '<div class="am-control"><button v-for="option in cliOptions" :key="option" class="am-cli-btn">{{ option }}</button></div>',
        },
      },
    },
  });
  await flush();

  const detectedTab = wrapper
    .findAll("button.tab-btn")
    .find((button) => button.text() === "Detected Coding Agents");
  expect(detectedTab).toBeTruthy();
  await detectedTab!.trigger("click");
  await flush();
  expect(wrapper.text()).toContain("Deprecated");
  expect(wrapper.text()).toContain("Use Antigravity CLI (agy) instead.");
  expect(wrapper.text()).toContain(
    "Enterprise and paid API-key Gemini CLI users may still have access.",
  );

  const defaultTab = wrapper
    .findAll("button.tab-btn")
    .find((button) => button.text() === "Default Agents");
  await defaultTab!.trigger("click");
  await flush();
  const defaultPanel = wrapper.findAll(".agent-tab-panel")[0];
  expect(defaultPanel.findAll(".am-cli-btn").map((button) => button.text())).toEqual(["opencode"]);
  wrapper.unmount();
});
