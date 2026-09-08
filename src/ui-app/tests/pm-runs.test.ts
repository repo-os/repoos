import { describe, expect, it } from "vitest";
import { pmCommand } from "../../server/agents";
import { clearPmWorking, isPmWorking, markPmWorking, withPmWorking } from "../../server/pm-runs";
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
