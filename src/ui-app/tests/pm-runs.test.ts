import { describe, expect, it } from "vitest";
import { pmCommand } from "../../server/agents";
import {
  clearPmChatSession,
  clearPmWorking,
  isPmWorking,
  markPmChatSession,
  markPmWorking,
  pmChatSessionTaskId,
  withPmWorking,
} from "../../server/pm-runs";
import type { Agent } from "../../core/types";

const base = { name: "pm", model: "provider/m", enabled: true } as const;

describe("pmCommand usage flags (0335)", () => {
  it("emits structured stream output for claude/qwen so runPrompt sees usage", () => {
    const claude = pmCommand({ ...base, cli: "claude code" }, "flesh it out", "/repo");
    expect(claude.args).toContain("--output-format");
    expect(claude.args).toContain("stream-json");

    const qwen = pmCommand({ ...base, cli: "qwen code" }, "flesh it out", "/repo");
    expect(qwen.args).toContain("stream-json");
  });

  it("emits --json for codex and json format for opencode/copilot", () => {
    const codex = pmCommand({ ...base, cli: "codex" }, "flesh it out", "/repo");
    expect(codex.args).toContain("--json");

    const oc = pmCommand({ ...base, cli: "opencode" }, "flesh it out", "/repo");
    expect(oc.args).toContain("--format");
    expect(oc.args).toContain("json");
    expect(oc.args).toContain("--dir");

    const copilot = pmCommand({ ...base, cli: "github copilot" }, "flesh it out", "/repo");
    expect(copilot.args).toContain("--output-format");
    expect(copilot.args).toContain("json");
  });

  it("never grants permission bypasses — the PM only authors text", () => {
    for (const cli of [
      "claude code",
      "qwen code",
      "codex",
      "opencode",
      "github copilot",
    ] as const) {
      const { args } = pmCommand({ ...base, cli }, "flesh it out", "/repo");
      expect(args).not.toContain("--dangerously-skip-permissions");
      expect(args).not.toContain("--sandbox");
      expect(args).not.toContain("--auto-full-access");
      expect(args).not.toContain("--yolo");
      // opencode's auto-approval flag — every gated tool call would be
      // approved without asking. The reviewer/runner paths use it on purpose;
      // the PM authoring pass must not.
      expect(args).not.toContain("--auto");
    }
  });
});

describe("pm working registry (0335)", () => {
  it("tracks and clears the in-flight flag", () => {
    markPmWorking("0099");
    expect(isPmWorking("0099")).toBe(true);
    clearPmWorking("0099");
    expect(isPmWorking("0099")).toBe(false);
  });

  it("withPmWorking augments payloads and passes null through", () => {
    markPmWorking("0098");
    expect(withPmWorking({ id: "0098", title: "t" })).toEqual({
      id: "0098",
      title: "t",
      pmWorking: true,
    });
    expect(withPmWorking({ id: "0097", title: "t" })).toEqual({
      id: "0097",
      title: "t",
      pmWorking: false,
    });
    expect(withPmWorking(null)).toBeNull();
    clearPmWorking("0098");
  });
});

describe("pm chat session registry (0381)", () => {
  const SESSION = "pm-task-v2:0042::dev@example.com";
  const SESSION_NO_AUTH = "pm-task-v2:0042";

  it("resolves only pm-task-v2 session keys to their task id", () => {
    expect(pmChatSessionTaskId(SESSION)).toBe("0042");
    expect(pmChatSessionTaskId(SESSION_NO_AUTH)).toBe("0042");
    // Engineer sessions are bare task ids; review/board-chat keys are not PM.
    expect(pmChatSessionTaskId("0042")).toBeNull();
    expect(pmChatSessionTaskId("review:0042")).toBeNull();
    expect(pmChatSessionTaskId("repoos-guide")).toBeNull();
    expect(pmChatSessionTaskId("cto:board")).toBeNull();
  });

  it("flags the task while a chat session runs, clears on its exit", () => {
    markPmChatSession(SESSION, "0042");
    expect(isPmWorking("0042")).toBe(true);
    clearPmChatSession(SESSION);
    expect(isPmWorking("0042")).toBe(false);
  });

  it("keeps the flag while another user's session for the same task still runs", () => {
    markPmChatSession(SESSION, "0042");
    markPmChatSession(SESSION_NO_AUTH, "0042");
    clearPmChatSession(SESSION);
    expect(isPmWorking("0042")).toBe(true);
    clearPmChatSession(SESSION_NO_AUTH);
    expect(isPmWorking("0042")).toBe(false);
  });

  it("chat sessions and the freeform flesh-out combine per task", () => {
    markPmWorking("0041");
    markPmChatSession(SESSION_NO_AUTH, "0041");
    // The chat run exits first — the flesh-out still owns the flag.
    clearPmChatSession(SESSION_NO_AUTH);
    expect(isPmWorking("0041")).toBe(true);
    clearPmWorking("0041");
    expect(isPmWorking("0041")).toBe(false);
  });
});
