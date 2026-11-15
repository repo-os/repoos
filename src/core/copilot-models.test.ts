import { describe, expect, it } from "vitest";
import {
  copilotNamedModelArgs,
  formatCopilotModelFailure,
  formatCopilotReasoningFailure,
  formatUnsupportedCopilotReasoning,
  isCopilotReasoningSupported,
  copilotModelReasoningHint,
} from "./copilot-models.js";

describe("copilot named model args", () => {
  it("pins low reasoning for catalog models", () => {
    expect(copilotNamedModelArgs("gpt-6-luna")).toEqual([
      "--model",
      "gpt-6-luna",
      "--reasoning-effort",
      "low",
    ]);
  });

  it("passes through unknown ids without reasoning", () => {
    expect(copilotNamedModelArgs("custom-model")).toEqual(["--model", "custom-model"]);
  });

  it("rejects unsupported reasoning before launch", () => {
    expect(() => copilotNamedModelArgs("gpt-6-luna", "minimal")).toThrow(
      formatUnsupportedCopilotReasoning("gpt-6-luna", "minimal"),
    );
  });

  it("reports reasoning support per model", () => {
    expect(isCopilotReasoningSupported("gpt-6-luna", "none")).toBe(true);
    expect(isCopilotReasoningSupported("gpt-6-luna", "minimal")).toBe(false);
    expect(isCopilotReasoningSupported("claude-haiku-5.5", "none")).toBe(false);
  });

  it("builds picker hints", () => {
    expect(copilotModelReasoningHint("gpt-6-luna")).toBe("reasoning none–max");
    expect(copilotModelReasoningHint("default")).toBeNull();
  });
});

describe("copilot failure enrichment", () => {
  it("maps model unavailable errors", () => {
    const msg = formatCopilotModelFailure(
      'Execution failed: Model "gpt-5.6-sol" is not available.',
    );
    expect(msg).toContain("gpt-5.6-sol");
    expect(msg).toContain("Agents page");
  });

  it("maps reasoning unsupported errors", () => {
    const raw = 'Error: Reasoning effort "none" is not supported for model "claude-haiku-5.5".';
    expect(formatCopilotReasoningFailure(raw)).toContain("claude-haiku-5.5");
    expect(formatCopilotReasoningFailure(raw)).toContain("low");
  });
});
