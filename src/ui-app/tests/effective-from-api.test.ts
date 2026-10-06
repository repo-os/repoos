import { describe, expect, it } from "vitest";
import { effectiveEngineerFromApi } from "../../cli/effective-from-api";

describe("effectiveEngineerFromApi", () => {
  it("applies cli/model overrides against server agent config", () => {
    const agents = [
      { name: "engineer", cli: "opencode", model: "deepseek/deepseek-v4.1-flash", enabled: true },
    ];
    const effective = effectiveEngineerFromApi(agents, {
      cliOverride: "cursor",
      modelOverride: "gpt-5",
    });
    expect(effective.cli).toBe("cursor");
    expect(effective.model).toBe("gpt-5");
  });
});
