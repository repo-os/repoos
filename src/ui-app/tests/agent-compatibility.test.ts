import { describe, expect, it } from "vitest";
import {
  AGENT_COMPATIBILITY_MANIFEST,
  compatibilityForAgent,
  parseAgentVersion,
} from "../../core/agent-compatibility";

describe("agent compatibility contracts", () => {
  it("keeps a machine-readable OpenCode v2 contract", () => {
    expect(AGENT_COMPATIBILITY_MANIFEST.schemaVersion).toBe(1);
    expect(AGENT_COMPATIBILITY_MANIFEST.contracts).toContainEqual(
      expect.objectContaining({
        cli: "opencode",
        supportedMajor: 2,
        newestCertifiedVersion: "2.0.0",
      }),
    );
  });

  it("parses common CLI version spellings", () => {
    expect(parseAgentVersion("opencode v2.4.1")).toEqual([2, 4, 1]);
    expect(parseAgentVersion("2")).toEqual([2, 0, 0]);
    expect(parseAgentVersion("unknown")).toBeNull();
  });

  it("warns for legacy and newer releases without blocking them", () => {
    const old = compatibilityForAgent({
      cli: "opencode",
      version: "opencode v1.9.0",
      drivable: true,
    });
    const newer = compatibilityForAgent({
      cli: "opencode",
      version: "opencode v2.1.0",
      drivable: true,
    });
    const breaking = compatibilityForAgent({
      cli: "opencode",
      version: "opencode v3.0.0",
      drivable: true,
    });
    expect(old.status).toBe("upgrade_recommended");
    expect(newer.status).toBe("newer_than_verified");
    expect(breaking.status).toBe("unsupported");
  });

  it("marks the certified major as verified", () => {
    expect(
      compatibilityForAgent({ cli: "opencode", version: "opencode v2.0.0", drivable: true }).status,
    ).toBe("verified");
  });
});
