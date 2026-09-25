import { describe, expect, it } from "vitest";
import { sortHeadlessAgents } from "../src/lib/headless-agent-order";

describe("sortHeadlessAgents", () => {
  it("orders pm, engineer, reviewer before other defaults", () => {
    const input = [{ name: "reviewer" }, { name: "engineer" }, { name: "pm" }, { name: "other" }];
    expect(sortHeadlessAgents(input).map((a) => a.name)).toEqual([
      "pm",
      "engineer",
      "reviewer",
      "other",
    ]);
  });

  it("preserves relative order for unknown names", () => {
    const input = [{ name: "zeta" }, { name: "alpha" }];
    expect(sortHeadlessAgents(input).map((a) => a.name)).toEqual(["alpha", "zeta"]);
  });
});
