/**
 * Tests for the Model Playground chat route's pure helpers (0313):
 * history sanitization (bounds, role coercion, empty-message filtering) and
 * prompt construction (opencode's `run` is stateless, so multi-turn context
 * has to be folded into the prompt text).
 */
import { describe, expect, it } from "vitest";
import {
  buildPlaygroundPrompt,
  isKnownRunId,
  sanitizePlaygroundHistory,
} from "../../server/routes/playground";

describe("sanitizePlaygroundHistory", () => {
  it("keeps well-formed user/assistant turns in order", () => {
    const history = sanitizePlaygroundHistory([
      { role: "user", text: "hi" },
      { role: "assistant", text: "hello" },
    ]);
    expect(history).toEqual([
      { role: "user", text: "hi" },
      { role: "assistant", text: "hello" },
    ]);
  });

  it("coerces any non-'assistant' role to 'user'", () => {
    const history = sanitizePlaygroundHistory([{ role: "system", text: "hi" }]);
    expect(history[0].role).toBe("user");
  });

  it("drops non-string or empty-after-trim messages", () => {
    const history = sanitizePlaygroundHistory([
      { role: "user", text: "   " },
      { role: "user", text: 42 },
      { role: "user", text: "ok" },
    ]);
    expect(history).toEqual([{ role: "user", text: "ok" }]);
  });

  it("caps message length and total turn count", () => {
    const long = "x".repeat(9000);
    const history = sanitizePlaygroundHistory([{ role: "user", text: long }]);
    expect(history[0].text.length).toBe(8000);

    const many = Array.from({ length: 30 }, (_, i) => ({ role: "user", text: `msg ${i}` }));
    const capped = sanitizePlaygroundHistory(many);
    expect(capped).toHaveLength(20);
    expect(capped[capped.length - 1].text).toBe("msg 29");
  });

  it("returns an empty list for non-array input", () => {
    expect(sanitizePlaygroundHistory(undefined)).toEqual([]);
    expect(sanitizePlaygroundHistory("not an array")).toEqual([]);
  });
});

describe("isKnownRunId", () => {
  it("accepts provider/model ids from registered providers", () => {
    expect(isKnownRunId("deepinfra/zai-org/GLM-5.3-Flash")).toBe(true);
    expect(isKnownRunId("openrouter/Qwen/Qwen3.8-2.4T-A95B")).toBe(true);
  });

  it("rejects an unregistered provider prefix", () => {
    expect(isKnownRunId("not-a-provider/some-model")).toBe(false);
  });

  it("rejects ids with no provider segment or disallowed characters", () => {
    expect(isKnownRunId("deepinfra")).toBe(false);
    expect(isKnownRunId("")).toBe(false);
    expect(isKnownRunId("deepinfra/model; rm -rf /")).toBe(false);
    expect(isKnownRunId("deepinfra/model with spaces")).toBe(false);
    expect(isKnownRunId("deepinfra/$(whoami)")).toBe(false);
  });
});

describe("buildPlaygroundPrompt", () => {
  it("names the model and folds every turn into one prompt ending on 'Assistant:'", () => {
    const prompt = buildPlaygroundPrompt("deepinfra/org/model", [
      { role: "user", text: "What is this repo?" },
      { role: "assistant", text: "It's RepoOS." },
      { role: "user", text: "Tell me more." },
    ]);
    expect(prompt).toContain("deepinfra/org/model");
    expect(prompt).toContain("User: What is this repo?");
    expect(prompt).toContain("Assistant: It's RepoOS.");
    expect(prompt.trim().endsWith("Assistant:")).toBe(true);
  });
});
