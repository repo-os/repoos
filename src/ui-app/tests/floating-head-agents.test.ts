import { describe, expect, it } from "vitest";
import { floatingHeadEnabled } from "../src/lib/floating-head-agents";

const baseAgents = [
  { name: "CTO", enabled: true },
  { name: "Ross", enabled: true },
];

describe("floatingHeadEnabled", () => {
  it("mirrors config for each head and shows all in preview builds", () => {
    const data = { builtInAgents: { debugger: { enabled: true } } };
    expect(
      floatingHeadEnabled("cto", { agents: baseAgents, configData: data, previewBuild: false }),
    ).toBe(true);
    expect(
      floatingHeadEnabled("debugger", {
        agents: baseAgents,
        configData: { builtInAgents: { debugger: { enabled: false } } },
        previewBuild: false,
      }),
    ).toBe(false);
    expect(
      floatingHeadEnabled("debugger", { agents: [], configData: null, previewBuild: true }),
    ).toBe(true);
  });
});
