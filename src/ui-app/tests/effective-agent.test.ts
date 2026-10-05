/**
 * Effective agent resolution for display (#0684).
 *
 * The board card's robot panel and the drawer's run header both ask
 * `resolveEffectiveAgent` "which agent/cli/model will this run actually use?".
 * It mirrors the server's `resolveAgentForTask` / `mergeAgentOverride` so the
 * UI cannot show a pin the run will not apply — the failure mode that let a
 * driver believe two tasks ran on Cursor when they ran on DeepSeek.
 */
import { describe, expect, it } from "vitest";
import { resolveEffectiveAgent, type EffectiveAgentInput } from "../src/lib/effective-agent";

const AGENTS: EffectiveAgentInput[] = [
  { name: "engineer", cli: "opencode", model: "deepseek/deepseek-v4.1-flash", enabled: true },
  { name: "pm", cli: "opencode", model: "openrouter/xiaomi/mimo", enabled: true },
  { name: "reviewer", cli: "cursor", model: "composer-2.5", enabled: true },
  { name: "retired", cli: "codex", model: "gpt-5", enabled: false },
];

describe("resolveEffectiveAgent (#0684)", () => {
  it("uses the role default when the task has no overrides", () => {
    const a = resolveEffectiveAgent(AGENTS, {}, "engineer");
    expect(a).toMatchObject({
      name: "engineer",
      cli: "opencode",
      model: "deepseek/deepseek-v4.1-flash",
    });
  });

  it("applies a CLI override and a pinned model", () => {
    const a = resolveEffectiveAgent(
      AGENTS,
      { cliOverride: "cursor", modelOverride: "composer-2.5" },
      "engineer",
    );
    expect(a).toMatchObject({ cli: "cursor", model: "composer-2.5" });
  });

  it("resets the model to the harness default when only the CLI changes", () => {
    // The base model belongs to the base CLI; keeping it would be an invalid
    // pair (the server resets it — see mergeAgentOverride).
    const a = resolveEffectiveAgent(AGENTS, { cliOverride: "cursor" }, "engineer");
    expect(a.cli).toBe("cursor");
    expect(a.model).toBe("default");
  });

  it("treats the 'default' model sentinel as no pin", () => {
    const a = resolveEffectiveAgent(AGENTS, { modelOverride: "default" }, "engineer");
    expect(a.model).toBe("deepseek/deepseek-v4.1-flash");
  });

  it("honours an agent-name override and reports that agent's cli/model", () => {
    const a = resolveEffectiveAgent(AGENTS, { agentOverride: "reviewer" }, "engineer");
    expect(a).toMatchObject({ name: "reviewer", cli: "cursor", model: "composer-2.5" });
  });

  it("reports the override name even when no enabled agent matches it", () => {
    // A stale/dis labled override must be visible, not silently shown as the
    // role default.
    const a = resolveEffectiveAgent(AGENTS, { agentOverride: "ghost" }, "engineer");
    expect(a.name).toBe("ghost");
    expect(a.cli).toBe("default");
  });

  it("ignores disabled agents when resolving the role default", () => {
    const a = resolveEffectiveAgent(AGENTS, { agentOverride: "retired" }, "engineer");
    expect(a.name).toBe("retired");
    expect(a.cli).toBe("default");
  });
});
