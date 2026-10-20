import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AGENT_CTA,
  STARTER_PROMPT,
  STARTER_PROMPT_PREVIEW,
  agentGuideHref,
} from "../../../agent/cta.js";

const repoRoot = process.cwd();

describe("shared agent prompt call to action", () => {
  it("uses the canonical starter prompt verbatim", () => {
    const prompt = readFileSync(`${repoRoot}/agent/starter-prompt.md`, "utf8").trim();
    expect(STARTER_PROMPT).toBe(prompt);
    expect(STARTER_PROMPT).toContain("# Set up RepoOS in this repository");
  });

  it("derives the compact preview from the opening of the prompt", () => {
    const opening = STARTER_PROMPT.split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .slice(0, 3);
    expect(STARTER_PROMPT_PREVIEW).toBe(
      opening.map((line) => line.replace(/^#{1,6}\s+/, "")).join("\n"),
    );
    expect(STARTER_PROMPT_PREVIEW).toContain("Set up RepoOS in this repository");
  });

  it("publishes the guide link each site needs, without a dead relative link", () => {
    expect(agentGuideHref("landing")).toBe("https://docs.repoos.org/ai-agents");
    expect(agentGuideHref("docs")).toBe("/ai-agents");
    expect(() => readFileSync(`${repoRoot}/user-docs/ai-agents.md`, "utf8")).not.toThrow();
  });

  it("keeps the copy in the shared module, not duplicated in either Vue component", () => {
    const components = [
      `${repoRoot}/landing/src/components/AgentPromptCta.vue`,
      `${repoRoot}/user-docs/.vitepress/theme/AgentPromptCta.vue`,
    ].map((path) => readFileSync(path, "utf8"));

    for (const source of components) {
      for (const value of [
        AGENT_CTA.heading,
        AGENT_CTA.sentence,
        AGENT_CTA.buttonLabel,
        AGENT_CTA.copiedLabel,
        AGENT_CTA.guideLabel,
        AGENT_CTA.guide.landing,
        AGENT_CTA.guide.docs,
      ]) {
        expect(source).not.toContain(value);
      }
      expect(source).toContain("agent/cta");
    }
  });
});
