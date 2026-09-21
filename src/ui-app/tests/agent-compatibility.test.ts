import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AGENT_COMPATIBILITY_MANIFEST,
  compatibilityForAgent,
  compatibilityForContract,
  parseAgentVersion,
  versionSatisfiesRange,
  type AgentCompatibilityContract,
} from "../../core/agent-compatibility";

/**
 * A contract with recorded certification evidence. The live manifest cannot
 * exercise `verified` / `newer_than_verified` yet (nothing is certified — see
 * the OpenCode entry), so those rungs are tested against this synthetic
 * contract instead of by lying about the shipped manifest.
 */
const CERTIFIED_CONTRACT: AgentCompatibilityContract = {
  cli: "opencode",
  name: "OpenCode",
  supportedMajor: 2,
  supportedRange: ">=2.0.0 <3.0.0",
  newestCertifiedVersion: "2.1.0",
  knownIncompatibleRanges: [">=3.0.0"],
  requiredCapabilities: ["version", "headless-one-shot"],
  verifiedAt: "2026-09-01",
  verificationSource: "repoos doctor --probe opencode --yes (fixture)",
  upgradeGuidance: "Install the current OpenCode v2 release.",
  officialUrl: "https://opencode.ai/docs/",
};

describe("agent compatibility contracts", () => {
  it("keeps a machine-readable OpenCode v2 contract", () => {
    expect(AGENT_COMPATIBILITY_MANIFEST.schemaVersion).toBe(1);
    expect(AGENT_COMPATIBILITY_MANIFEST.contracts).toContainEqual(
      expect.objectContaining({
        cli: "opencode",
        supportedMajor: 2,
        // Nothing is certified yet: the manifest must not name a "certified"
        // release while `verifiedAt` is null.
        newestCertifiedVersion: null,
        verifiedAt: null,
      }),
    );
  });

  it("parses common CLI version spellings", () => {
    expect(parseAgentVersion("opencode v2.4.1")).toEqual([2, 4, 1]);
    expect(parseAgentVersion("2")).toEqual([2, 0, 0]);
    expect(parseAgentVersion("build 2026 opencode v2.4.1")).toEqual([2, 4, 1]);
    expect(parseAgentVersion("unknown")).toBeNull();
  });

  it("reports the tracked-but-uncertified OpenCode line honestly", () => {
    const old = compatibilityForAgent({
      cli: "opencode",
      version: "opencode v1.9.0",
      drivable: true,
    });
    const tracked = compatibilityForAgent({
      cli: "opencode",
      version: "opencode v2.1.0",
      drivable: true,
    });
    const breaking = compatibilityForAgent({
      cli: "opencode",
      version: "opencode v3.0.0",
      drivable: true,
    });
    // Old line → nudge to upgrade; in-range but uncertified → not yet probed
    // (there is no certified baseline to be "newer than"); known-bad → unsupported.
    expect(old.status).toBe("upgrade_recommended");
    expect(tracked.status).toBe("not_probed");
    expect(breaking.status).toBe("unsupported");
  });

  it("walks the full status ladder once a contract carries certification evidence", () => {
    const at = (version: string) =>
      compatibilityForContract(CERTIFIED_CONTRACT, { version, drivable: true }).status;
    expect(at("opencode v2.0.0")).toBe("verified");
    expect(at("opencode v2.1.0")).toBe("verified");
    expect(at("opencode v2.2.0")).toBe("newer_than_verified");
    expect(at("opencode v1.9.0")).toBe("upgrade_recommended");
    expect(at("opencode v3.0.0")).toBe("unsupported");
  });

  it("prefers a known-incompatible family over the old-major nudge", () => {
    const contract: AgentCompatibilityContract = {
      ...CERTIFIED_CONTRACT,
      knownIncompatibleRanges: [">=1.5.0 <2.0.0"],
    };
    expect(
      compatibilityForContract(contract, { version: "opencode v1.8.0", drivable: true }).status,
    ).toBe("unsupported");
  });

  it("flags a manifest that records evidence and a certified version inconsistently", () => {
    // Evidence without a certified version.
    const evidenceNoVersion: AgentCompatibilityContract = {
      ...CERTIFIED_CONTRACT,
      newestCertifiedVersion: null,
    };
    expect(
      compatibilityForContract(evidenceNoVersion, { version: "opencode v2.1.0", drivable: true })
        .status,
    ).toBe("not_probed");
    // A certified version without evidence.
    const versionNoEvidence: AgentCompatibilityContract = {
      ...CERTIFIED_CONTRACT,
      verifiedAt: null,
      verificationSource: null,
    };
    expect(
      compatibilityForContract(versionNoEvidence, { version: "opencode v2.1.0", drivable: true })
        .status,
    ).toBe("not_probed");
    // An unparseable certified version.
    const junkVersion: AgentCompatibilityContract = {
      ...CERTIFIED_CONTRACT,
      newestCertifiedVersion: "not-a-version",
    };
    expect(
      compatibilityForContract(junkVersion, { version: "opencode v2.1.0", drivable: true }).status,
    ).toBe("not_probed");
  });

  it("keeps currently tracked v2 releases as unverified until a contract suite exists", () => {
    expect(
      compatibilityForAgent({ cli: "opencode", version: "opencode v2.0.0", drivable: true }).status,
    ).toBe("not_probed");
  });

  it("matches version ranges and known incompatible releases", () => {
    expect(parseAgentVersion("opencode v2.0.0")).toEqual([2, 0, 0]);
    expect(parseAgentVersion("2.0.0-beta.1")).toEqual([2, 0, 0]);
    expect(
      compatibilityForAgent({ cli: "opencode", version: "opencode v2.0.0", drivable: true }).status,
    ).toBe("not_probed");
  });

  it("does not mistake bare build numbers or years for a major version", () => {
    expect(parseAgentVersion("20260921")).toBeNull();
    expect(parseAgentVersion("2026")).toBeNull();
    expect(parseAgentVersion("build 20260921 v2.4.1")).toEqual([2, 4, 1]);
    expect(parseAgentVersion("2")).toEqual([2, 0, 0]);
  });

  it("supports caret, tilde, wildcard, and OR range tokens", () => {
    expect(versionSatisfiesRange([2, 1, 3], "^2.1.0")).toBe(true);
    expect(versionSatisfiesRange([2, 9, 9], "^2.1.0")).toBe(true);
    expect(versionSatisfiesRange([3, 0, 0], "^2.1.0")).toBe(false);
    expect(versionSatisfiesRange([2, 2, 5], "~2.2.0")).toBe(true);
    expect(versionSatisfiesRange([2, 3, 0], "~2.2.0")).toBe(false);
    expect(versionSatisfiesRange([1, 2, 7], "1.2.*")).toBe(true);
    expect(versionSatisfiesRange([1, 3, 0], "1.2.*")).toBe(false);
    // A lone-major wildcard is <next-major, not <1.1.0: `1.x`/`1.*` must match
    // any 1.y (npm semantics), and `3.x` any 3.y.
    expect(versionSatisfiesRange([1, 9, 0], "1.x")).toBe(true);
    expect(versionSatisfiesRange([2, 0, 0], "1.x")).toBe(false);
    expect(versionSatisfiesRange([1, 9, 0], "1.*")).toBe(true);
    expect(versionSatisfiesRange([2, 0, 0], "1.*")).toBe(false);
    expect(versionSatisfiesRange([2, 5, 0], "2.x")).toBe(true);
    expect(versionSatisfiesRange([3, 0, 0], "2.x")).toBe(false);
    expect(versionSatisfiesRange([3, 7, 2], "1.x || 2.x || 3.x")).toBe(true);
    expect(versionSatisfiesRange([3, 0, 0], "1.x || 2.x || 3.x")).toBe(true);
    expect(versionSatisfiesRange([4, 0, 0], "1.x || 2.x || 3.x")).toBe(false);
    expect(versionSatisfiesRange([3, 0, 0], ">=2.0.0 <3.0.0")).toBe(false);
  });

  it("labels known-but-undrivable harnesses unsupported rather than not probed", () => {
    // Undrivable agents (gemini, aider, …) have no `cli` field, so the real
    // detect path passes cli: undefined here — and the result must still be
    // "unsupported", not "not yet probed".
    const gemini = compatibilityForAgent({ cli: undefined, version: null, drivable: false });
    expect(gemini.status).toBe("unsupported");
    const aider = compatibilityForAgent({
      cli: undefined,
      version: "aider 0.60.0",
      drivable: false,
    });
    expect(aider.status).toBe("unsupported");
    // A drivable harness without a contract stays honestly "not yet probed".
    const kiro = compatibilityForAgent({ cli: "kiro", version: null, drivable: true });
    expect(kiro.status).toBe("not_probed");
  });

  describe("built dist artifact", () => {
    // Vitest's import.meta.url is not a file: URL, so resolve the worktree's
    // dist/ from cwd (tests always run from the repo root).
    const distModulePath = join(process.cwd(), "dist/core/agent-compatibility.js");
    const distJsonPath = join(process.cwd(), "dist/core/agent-compatibility.json");
    const isDistBuilt = existsSync(distModulePath) && existsSync(distJsonPath);

    it.runIf(isDistBuilt)(
      "loads the manifest from dist after a real build (scripts/copy-assets.mjs)",
      async () => {
        const built = (await import(pathToFileURL(distModulePath).href)) as {
          AGENT_COMPATIBILITY_MANIFEST: {
            schemaVersion: number;
            contracts: Array<{ cli: string; newestCertifiedVersion: string | null }>;
          };
        };
        expect(built.AGENT_COMPATIBILITY_MANIFEST.contracts.length).toBeGreaterThan(0);
        expect(built.AGENT_COMPATIBILITY_MANIFEST.contracts).toContainEqual(
          expect.objectContaining({ cli: "opencode", newestCertifiedVersion: null }),
        );
      },
    );
  });
});
