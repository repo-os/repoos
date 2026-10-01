/**
 * pi driver. pi is the only harness whose whole protocol is documented JSONL:
 * a `session` header carries the id, `message_end` carries authoritative
 * assistant text + usage, and tool activity is a `tool_execution_start` /
 * `tool_execution_end` pair. Approval is a property of the non-interactive
 * mode (no bypass flag), and `--session` resumes an exact session.
 */
import { describe, expect, it } from "vitest";
import {
  engineerLaunches,
  engineerPermissionGaps,
  engineCancelSignal,
  extractUsage,
  parsePiEvent,
  pmCommand,
  promptCommand,
} from "../../server/agents";
import type { Agent } from "../../core/types";

const agent = (model = "default"): Agent => ({
  name: "engineer",
  cli: "pi",
  model,
  enabled: true,
});

describe("pi invocation shapes", () => {
  it("runs headless JSONL with a positional prompt", () => {
    expect(promptCommand(agent(), "do the thing")).toEqual({
      cmd: "pi",
      args: ["--mode", "json", "do the thing"],
    });
  });

  it("forwards an explicit model with --model", () => {
    expect(promptCommand(agent("openai/gpt-5"), "ping")).toEqual({
      cmd: "pi",
      args: ["--mode", "json", "--model", "openai/gpt-5", "ping"],
    });
  });

  it("resumes with --session <id> and never --continue", () => {
    const [, followUp] = engineerLaunches(agent(), "/tmp/wt");
    expect(followUp.cmd).toBe("pi");
    expect(followUp.args).toEqual(["--mode", "json", "--session", "session-id", "continue"]);
    expect(followUp.args).not.toContain("--continue");
  });

  it("needs no permission-bypass flag (approval is a property of the mode)", () => {
    for (const { args } of engineerLaunches(agent(), "/tmp/wt")) {
      expect(engineerPermissionGaps("pi", args)).toEqual([]);
      expect(args).not.toContain("--auto");
      expect(args).not.toContain("--yolo");
      expect(args).not.toContain("--dangerously-skip-permissions");
    }
  });

  it("keeps SIGTERM as the cancellation signal", () => {
    expect(engineCancelSignal("pi")).toBe("SIGTERM");
  });

  it("restricts the authoring one-shot to read-only tools", () => {
    const { cmd, args } = pmCommand(agent(), "author the body", "/tmp/wt");
    expect(cmd).toBe("pi");
    expect(args).toContain("--tools");
    expect(args[args.indexOf("--tools") + 1]).toBe("read,grep,find,ls");
  });
});

describe("pi event parsing", () => {
  it("captures the session id from the header", () => {
    const raw = JSON.stringify({ type: "session", version: 3, id: "sess-abc", cwd: "/x" });
    expect(parsePiEvent(raw)).toEqual({ sessionID: "sess-abc" });
  });

  it("surfaces assistant text once, from message_end", () => {
    const raw = JSON.stringify({
      type: "message_end",
      message: { role: "assistant", content: [{ type: "text", text: "hello" }] },
    });
    expect(parsePiEvent(raw)).toEqual({ entry: { type: "text", text: "hello" } });
  });

  it("swallows streaming deltas and lifecycle events rather than dumping JSON", () => {
    expect(
      parsePiEvent(
        JSON.stringify({
          type: "message_update",
          usage: { input: 1, output: 1, totalTokens: 2 },
          assistantMessageEvent: { type: "text_delta", delta: "he" },
        }),
      ),
    ).toEqual({});
    expect(parsePiEvent(JSON.stringify({ type: "turn_start" }))).toEqual({});
    expect(parsePiEvent(JSON.stringify({ type: "agent_settled" }))).toEqual({});
  });

  it("surfaces a tool call as a start/end pair keyed by toolCallId", () => {
    const start = parsePiEvent(
      JSON.stringify({
        type: "tool_execution_start",
        toolCallId: "call-1",
        toolName: "bash",
        args: { command: "ls" },
      }),
    );
    expect(start?.toolEvent).toEqual({
      phase: "start",
      id: "call-1",
      tool: "bash",
      input: "ls",
    });
    const end = parsePiEvent(
      JSON.stringify({
        type: "tool_execution_end",
        toolCallId: "call-1",
        toolName: "bash",
        result: { content: [{ type: "text", text: "file.ts" }] },
        isError: false,
      }),
    );
    expect(end?.toolEvent).toEqual({
      phase: "complete",
      id: "call-1",
      tool: "bash",
      output: "file.ts",
    });
  });

  it("returns null for non-JSON and unrecognized event types", () => {
    expect(parsePiEvent("not json")).toBeNull();
    expect(parsePiEvent(JSON.stringify({ type: "some_future_event" }))).toBeNull();
  });
});

describe("pi usage extraction", () => {
  it("reads pi's usage naming from an authoritative message_end", () => {
    const raw = JSON.stringify({
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "OK" }],
        usage: {
          input: 100,
          output: 5,
          totalTokens: 105,
          cacheRead: 3,
          cacheWrite: 2,
          cost: { total: 0.01 },
        },
      },
    });
    expect(extractUsage(raw)).toMatchObject({
      inputTokens: 100,
      outputTokens: 5,
      totalTokens: 105,
      costUsd: 0.01,
      cacheReadTokens: 3,
      cacheCreationTokens: 2,
      deltas: true,
    });
  });

  it("ignores the duplicated cumulative usage on message_update", () => {
    const raw = JSON.stringify({
      type: "message_update",
      usage: { input: 100, output: 5, totalTokens: 105, cost: { total: 0.01 } },
      assistantMessageEvent: { type: "text_delta", delta: "hi" },
    });
    expect(extractUsage(raw)).toEqual({});
  });

  it("counts one turn per turn_end", () => {
    expect(extractUsage(JSON.stringify({ type: "turn_end" })).turns).toBe(1);
  });
});
