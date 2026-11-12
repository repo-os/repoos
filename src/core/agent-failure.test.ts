import { describe, expect, it } from "vitest";
import { classifyAgentFailure, formatAgentFailure } from "./agent-failure.js";

describe("classifyAgentFailure", () => {
  it.each([
    "opencode",
    "claude code",
    "qwen code",
    "kiro",
    "codex",
    "github copilot",
    "cursor",
    "antigravity",
    "crush",
    "pi",
    "muse",
  ])("classifies signed-out text for %s", (cli) => {
    expect(classifyAgentFailure("Not logged in", cli)?.id).toBe("auth");
  });

  it.each([
    ["cursor", "Cannot use this model: composer-2.5", "model-unavailable"],
    ["Claude Code", "OAuth token expired; please log in again", "auth"],
    ["GitHub Copilot", "Auto preference balance is unavailable", "model-unavailable"],
    ["codex", "usage limit reached until 14:00", "usage-limit"],
    ["opencode", "ENOTFOUND api.example.test", "network"],
  ])("classifies %s failure", (cli, text, id) => {
    expect(classifyAgentFailure(text, cli)?.id).toBe(id);
  });

  it("preserves unknown output and includes raw CLI output for known failures", () => {
    expect(classifyAgentFailure("something unexpected", "cursor")).toBeNull();
    expect(formatAgentFailure("Cannot use this model: composer-2.5", "cursor")).toContain(
      "CLI: Cannot use this model: composer-2.5",
    );
  });

  it("keeps a provider reset time in usage-limit guidance", () => {
    expect(classifyAgentFailure("usage limit reached until 14:00", "Claude Code")?.summary).toBe(
      "Claude Code usage limit reached until 14:00.",
    );
  });
});
