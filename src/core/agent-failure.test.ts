import { describe, expect, it } from "vitest";
import {
  classifyAgentFailure,
  formatAgentFailure,
  splitAgentFailureDetail,
} from "./agent-failure.js";

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

  it.each([
    [
      "opencode",
      "opencode exited with code 1: > build · deepseek-ai/DeepSeek-V4.1-Flash Error: You need positive balance to do inference. Please add balance manually or setup top-up",
      "out-of-credit",
    ],
    ["opencode", "HTTP 402 Payment Required", "out-of-credit"],
    ["opencode", "insufficient credit on this account", "out-of-credit"],
    [
      "antigravity",
      'AGY_ERROR: {"short_error":"RESOURCE_EXHAUSTED (code 429)", "detail":"…"}',
      "usage-limit",
    ],
    ["cursor", "Individual quota reached for this model", "usage-limit"],
    ["Claude Code", "too many requests — try again later", "usage-limit"],
    ["cursor", "usage limit reached. Resets in 95h12m41s", "usage-limit"],
  ])("classifies provider billing/limit text for %s", (cli, text, id) => {
    expect(classifyAgentFailure(text, cli)?.id).toBe(id);
  });

  it("includes Resets in timing for quota exhaustion", () => {
    expect(
      classifyAgentFailure("RESOURCE_EXHAUSTED Resets in 95h12m41s", "antigravity")?.summary,
    ).toBe("Antigravity hit a provider quota or rate limit. Resets in 95h12m41s.");
  });

  it("wraps known failures with a CLI disclosure tail", () => {
    const formatted = formatAgentFailure("Cannot use this model: composer-2.5", "cursor");
    expect(formatted).toContain("CLI: Cannot use this model: composer-2.5");
    const parts = splitAgentFailureDetail(formatted);
    expect(parts.raw).toBe("Cannot use this model: composer-2.5");
    expect(parts.summary).toMatch(/not available/);
  });

  it("uses a generic fallback for JSON blobs instead of showing them as the summary", () => {
    const blob = 'AGY_ERROR: {"short_error":"RESOURCE_EXHAUSTED (code 429)","detail":"quota"}';
    const formatted = formatAgentFailure(blob, "antigravity");
    const parts = splitAgentFailureDetail(formatted);
    expect(parts.summary).not.toContain("{");
    expect(parts.summary).toMatch(/quota or rate limit/);
    expect(parts.raw).toContain("AGY_ERROR");
  });

  it("strips ANSI and caps the raw CLI tail", () => {
    const ansi = "\u001b[31mError: boom\u001b[0m";
    const formatted = formatAgentFailure(ansi, "cursor");
    const parts = splitAgentFailureDetail(formatted);
    expect(parts.raw).toBe("Error: boom");
    expect(parts.summary).toBe("Error: boom. Open Raw CLI error for details.");
  });

  it("falls back to a short first line when it is readable", () => {
    const formatted = formatAgentFailure("spawn ENOENT: missing-binary", "cursor");
    expect(splitAgentFailureDetail(formatted).summary).toBe(
      "spawn ENOENT: missing-binary. Open Raw CLI error for details.",
    );
  });

  it("falls back to cli name for multi-line opaque output", () => {
    const formatted = formatAgentFailure('line one\n{"json":true}\nline three', "opencode");
    expect(splitAgentFailureDetail(formatted).summary).toBe(
      "OpenCode exited with an error. Open Raw CLI error for details.",
    );
  });

  it("keeps a provider reset time in usage-limit guidance", () => {
    expect(classifyAgentFailure("usage limit reached until 14:00", "Claude Code")?.summary).toBe(
      "Claude usage limit reached until 14:00.",
    );
  });

  it("does not repeat the summary when formatting an already-formatted failure", () => {
    const raw = 'opencode exited with code 1\n{"error":"boom"}';
    const once = formatAgentFailure(raw, "opencode");
    const twice = formatAgentFailure(once, "opencode");
    expect(twice).toBe(once);
    expect(twice.match(/OpenCode exited with an error/g)).toHaveLength(1);
    expect(twice.match(/opencode exited with code 1/g)).toHaveLength(1);
  });

  it("keeps a stored OpenCode summary without repeating it inside the CLI tail (#1133)", () => {
    const stored = "OpenCode exited with an error. Open Raw CLI error for details.";
    expect(formatAgentFailure(stored, "opencode")).toBe(stored);
    expect(splitAgentFailureDetail(formatAgentFailure(stored, "opencode"))).toEqual({
      summary: stored,
      raw: null,
    });
  });

  it("keeps an already-concise classified summary unchanged", () => {
    const stored = "OpenCode is out of credit. Add balance, or pick another model.";
    expect(formatAgentFailure(stored, "opencode")).toBe(stored);
  });

  it("re-formats the raw tail of a stored formatted failure exactly once", () => {
    const stored =
      "opencode exited with code 1: Error: You need positive balance to do inference. (CLI: opencode exited with code 1: Error: You need positive balance to do inference.)";
    const formatted = formatAgentFailure(stored, "opencode");
    const parts = splitAgentFailureDetail(formatted);
    expect(parts.summary).toBe("OpenCode is out of credit. Add balance, or pick another model.");
    expect(parts.raw).toBe(
      "opencode exited with code 1: Error: You need positive balance to do inference.",
    );
  });
});
