import { describe, expect, it } from "vitest";
import { agentSpawnErrorMessage } from "./agent-spawn-error.js";

describe("agentSpawnErrorMessage", () => {
  it("names an unavailable CLI and the PATH searched", () => {
    expect(agentSpawnErrorMessage("codex", Object.assign(new Error("missing"), { code: "ENOENT" }), "/bin:/usr/bin"))
      .toBe("Agent CLI `codex` was not found (spawn ENOENT). PATH searched: /bin:/usr/bin");
  });

  it("does not misclassify other spawn errors", () => {
    expect(agentSpawnErrorMessage("codex", Object.assign(new Error("denied"), { code: "EACCES" }), "/bin"))
      .toBeUndefined();
  });
});
