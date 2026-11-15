import { describe, expect, it } from "vitest";
import {
  agentRunTone,
  describeAgentRunSetup,
  formatAgentRunLabel,
  matchAgentRunSetup,
  normalizeCodingAgent,
  normalizeModelName,
} from "./agent-last-runs.js";

const current = { cli: "opencode", model: "glm-5.3-flash" };

describe("matchAgentRunSetup", () => {
  it("treats a run from the agent's current CLI and model as current", () => {
    expect(matchAgentRunSetup({ codingAgent: "opencode", model: "glm-5.3-flash" }, current)).toBe(
      "current",
    );
  });

  it("never reports a run from an older coding agent as current", () => {
    expect(
      matchAgentRunSetup(
        { codingAgent: "opencode", model: "glm-5.3-flash" },
        {
          cli: "codex",
          model: "gpt-5",
        },
      ),
    ).toBe("previous");
  });

  it("never reports a run from an older model as current", () => {
    expect(matchAgentRunSetup({ codingAgent: "opencode", model: "old-model" }, current)).toBe(
      "previous",
    );
  });

  it("matches CLI aliases and case-insensitive names", () => {
    expect(
      matchAgentRunSetup(
        { codingAgent: "Claude Code", model: "Sonnet-4" },
        { cli: "claude", model: "sonnet-4" },
      ),
    ).toBe("current");
  });

  it("returns unknown when the response predates the CLI/model fields", () => {
    expect(matchAgentRunSetup({}, current)).toBe("unknown");
    expect(matchAgentRunSetup({ codingAgent: "", model: null }, current)).toBe("unknown");
  });
});

describe("formatAgentRunLabel", () => {
  it("labels a current failure with its clock time", () => {
    expect(formatAgentRunLabel({ status: "errored", ...current }, "current", "21:36")).toBe(
      "Failed 21:36",
    );
  });

  it("labels a healthy current run and a running one", () => {
    expect(formatAgentRunLabel({ status: "finished", ...current }, "current", "21:40")).toBe(
      "Last run 21:40",
    );
    expect(formatAgentRunLabel({ status: "running", ...current }, "current", "21:40")).toBe(
      "Running 21:40",
    );
  });

  it("names an older combination instead of presenting it as the current status", () => {
    const old = { status: "errored", codingAgent: "opencode", model: "glm-5.3-flash" };
    expect(formatAgentRunLabel(old, "previous", "21:36")).toBe(
      "Previous setup (opencode + glm-5.3-flash)",
    );
    expect(describeAgentRunSetup(old)).toBe("opencode + glm-5.3-flash");
  });

  it("falls back to readable setup names for old rows", () => {
    expect(describeAgentRunSetup({})).toBe("unknown CLI + unknown model");
  });
});

describe("agentRunTone", () => {
  it.each([
    ["errored", "current", "error"],
    ["finished", "current", "ok"],
    ["running", "current", "running"],
    ["errored", "previous", "muted"],
    ["finished", "previous", "muted"],
  ] as const)("maps %s/%s to %s", (status, match, tone) => {
    expect(agentRunTone(status, match)).toBe(tone);
  });
});

describe("normalization", () => {
  it("collapses CLI aliases", () => {
    expect(normalizeCodingAgent(" Claude  Code ")).toBe("claude code");
    expect(normalizeCodingAgent("agy")).toBe("antigravity");
    expect(normalizeCodingAgent("Qwen Code")).toBe("qwen code");
    expect(normalizeCodingAgent(null)).toBe("");
  });

  it("lowercases model names", () => {
    expect(normalizeModelName("  GLM-5.3-Flash ")).toBe("glm-5.3-flash");
  });
});
