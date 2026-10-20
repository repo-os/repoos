/**
 * Settings import/export (#0779): the transfer lib serializes a selection of
 * settings to TOML, parses such a file back, and builds the PATCH body an
 * import applies — round-tripping byte-clean, rejecting non-export files, and
 * never letting one bad key fail a whole import.
 */
import { describe, expect, it } from "vitest";
import {
  buildImportPatch,
  exportFilename,
  normalizeHostList,
  parseSettingsExport,
  sanitizeAgentModelFavorites,
  sanitizeBudgetAllowlist,
  sanitizeIdList,
  sanitizeRemoteValidation,
  serializeSettingsExport,
  summarizeSettingsExport,
  type SettingsExportData,
} from "../src/lib/settings-transfer";

const FULL: SettingsExportData = {
  budgetAllowlist: [
    { cli: "opencode", models: ["model-a", "model-b"] },
    { cli: "claude code", models: ["haiku"] },
  ],
  agentModelFavorites: [
    { cli: "opencode", model: "model-a", addedAt: 123 },
    { cli: "cursor", model: "composer-2.5" },
  ],
  starredAgents: ["opencode", "claude code"],
  starredThemes: ["jelly", "classic"],
  remoteValidation: {
    enabled: true,
    provider: "tailscale",
    tailscaleHosts: ["nick@bee", "thinkpad"],
    tailscaleUser: "nick",
    containerImage: "repoos-ci",
    maxConcurrent: 2,
    fallbackToLocal: true,
    retryOtherHosts: true,
    engineerSelfCheckRemote: false,
    useForReleases: false,
    hangIdleMinutes: 5,
    serverType: "cax31",
    location: "hil",
    snapshotId: "snap-1",
    sshKeyName: "key-1",
    idleShutdownMinutes: 8,
    maxServerLifetimeMinutes: 120,
  },
};

const META = { repo: "myrepo", exportedAt: "2026-10-14T08:00:00.000Z" };

describe("serializeSettingsExport", () => {
  it("writes every selected section and omits unselected ones", () => {
    const toml = serializeSettingsExport({ starredThemes: ["jelly"] }, META);
    expect(toml).toContain("[starredThemes]");
    expect(toml).toContain('ids = ["jelly"]');
    expect(toml).not.toContain("budget.allowlist");
    expect(toml).not.toContain("[remoteValidation]");
    expect(toml).not.toContain("agentModelFavorites");
    expect(toml).not.toContain("[starredAgents]");
  });

  it("marks empty-but-selected sections so import can tell them from omitted ones", () => {
    const toml = serializeSettingsExport({ budgetAllowlist: [], starredAgents: [] }, META);
    expect(toml).toContain("[budget.allowlist]");
    expect(toml).toContain("[starredAgents]");
  });

  it("escapes strings that need it (quotes, hashes, backslashes)", () => {
    const toml = serializeSettingsExport(
      { starredAgents: ['weird "cli" #1', "back\\slash"] },
      META,
    );
    const result = parseSettingsExport(toml);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.parsed.data.starredAgents).toEqual(['weird "cli" #1', "back\\slash"]);
    }
  });
});

describe("parseSettingsExport round-trip", () => {
  it("round-trips a full export byte-clean through values", () => {
    const toml = serializeSettingsExport(FULL, META);
    const result = parseSettingsExport(toml);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.present).toEqual([
      "budgetAllowlist",
      "remoteValidation",
      "agentModelFavorites",
      "starredAgents",
      "starredThemes",
    ]);
    expect(result.parsed.warnings).toEqual([]);
    expect(result.parsed.data).toEqual(FULL);
  });

  it("round-trips paused allowlist rows, including per-model pauses (#0850)", () => {
    const data: SettingsExportData = {
      budgetAllowlist: [
        {
          cli: "cursor",
          models: ["composer-2.5"],
          paused: true,
          pausedUntil: "2026-10-22T09:00:00.000Z",
          pausedReason: "Cursor credits exhausted",
        },
        {
          cli: "opencode",
          models: ["big pickle", "deepseek v4"],
          pausedModels: [
            { model: "big pickle", pausedReason: "rate limited" },
            { model: "deepseek v4", pausedUntil: "2026-10-23T09:00:00.000Z" },
          ],
        },
      ],
    };
    const result = parseSettingsExport(serializeSettingsExport(data, META));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.warnings).toEqual([]);
    expect(result.parsed.data.budgetAllowlist).toEqual(data.budgetAllowlist);
  });

  it("round-trips empty sections as present-but-empty", () => {
    const toml = serializeSettingsExport(
      { budgetAllowlist: [], remoteValidation: {}, starredThemes: [] },
      META,
    );
    const result = parseSettingsExport(toml);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.present).toEqual(["budgetAllowlist", "remoteValidation", "starredThemes"]);
    expect(result.parsed.data.budgetAllowlist).toEqual([]);
    expect(result.parsed.data.remoteValidation).toEqual({});
    expect(result.parsed.data.starredThemes).toEqual([]);
  });

  it("rejects files with no recognizable export content", () => {
    expect(parseSettingsExport("").ok).toBe(false);
    expect(parseSettingsExport("# just a comment\n").ok).toBe(false);
    // A stray repoos.toml MAY parse its [remoteValidation] table — that is
    // acceptable (it only contains that section); what must never happen is a
    // silent "import nothing".
    const stray = parseSettingsExport('workDir = "work"\n[remoteValidation]\nenabled = true\n');
    expect(stray.ok).toBe(true);
    if (stray.ok) {
      expect(stray.parsed.present).toEqual(["remoteValidation"]);
      expect(stray.parsed.data.remoteValidation).toEqual({ enabled: true });
    }
  });

  it("turns unknown sections into warnings, not errors", () => {
    const toml = `${serializeSettingsExport({ starredThemes: ["jelly"] }, META)}\n[preview]\ncommand = "x"\n`;
    const result = parseSettingsExport(toml);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.present).toEqual(["starredThemes"]);
    expect(result.parsed.warnings).toContain('Ignoring unrecognized section "[preview]".');
  });

  it("warns on unknown remoteValidation keys and drops mistyped values", () => {
    const toml = [
      "[remoteValidation]",
      "enabled = true",
      "bogusKey = 1",
      'provider = "warp-drive"',
      'maxConcurrent = "lots"',
      "",
    ].join("\n");
    const result = parseSettingsExport(toml);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.data.remoteValidation).toEqual({ enabled: true });
    expect(result.parsed.warnings).toContain('Ignoring unknown [remoteValidation] key "bogusKey".');
    expect(
      result.parsed.warnings.some((w) => w.includes('"provider"') && w.includes("Skipping")),
    ).toBe(true);
    expect(
      result.parsed.warnings.some((w) => w.includes('"maxConcurrent"') && w.includes("Skipping")),
    ).toBe(true);
  });

  it("rejects an allowlist section with zero valid rows", () => {
    const toml = '[[budget.allowlist]]\ncli = ""\nmodels = []\n';
    const result = parseSettingsExport(toml);
    expect(result.ok).toBe(false);
  });

  it("warns when the file comes from a newer export version", () => {
    const toml = serializeSettingsExport({ starredThemes: ["jelly"] }, META).replace(
      "version = 1",
      "version = 99",
    );
    const result = parseSettingsExport(toml);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.parsed.warnings.some((w) => w.includes("newer RepoOS"))).toBe(true);
    }
  });
});

describe("exportFilename", () => {
  it("names files repoos_<repo>_export_<timestamp>.toml", () => {
    const name = exportFilename("myrepo", new Date("2026-10-14T08:01:02.000Z"));
    expect(name).toBe("repoos_myrepo_export_20261014-080102.toml");
  });

  it("sanitizes hostile repo names and falls back when empty", () => {
    expect(exportFilename("my cool/repo!", new Date("2026-10-14T08:01:02.000Z"))).toBe(
      "repoos_my_cool_repo_export_20261014-080102.toml",
    );
    expect(exportFilename("", new Date("2026-10-14T08:01:02.000Z"))).toBe(
      "repoos_repo_export_20261014-080102.toml",
    );
  });
});

describe("normalizeHostList", () => {
  it("accepts flat strings, user@host strings, and row objects", () => {
    expect(
      normalizeHostList([
        "bee",
        "nick@mac1",
        { host: "mac1", user: "nick" },
        { host: "x", os: "linux" },
      ]),
    ).toEqual(["bee", "nick@mac1", "x"]);
  });

  it("splits a hand-written comma string and drops blanks", () => {
    expect(normalizeHostList("bee, mac1,,")).toEqual(["bee", "mac1"]);
  });
});

describe("sanitizers", () => {
  it("drops allowlist rows without a cli or models", () => {
    expect(
      sanitizeBudgetAllowlist([
        { cli: "opencode", models: ["a"] },
        { cli: "", models: ["a"] },
        { cli: "x", models: [] },
        "nope",
      ]),
    ).toEqual([{ cli: "opencode", models: ["a"] }]);
  });

  it("keeps valid pause fields and drops malformed ones (#0850)", () => {
    expect(
      sanitizeBudgetAllowlist([
        {
          cli: "cursor",
          models: ["composer-2.5"],
          paused: true,
          pausedUntil: "2026-10-22T09:00:00Z",
          pausedReason: "credits",
          pausedModels: ["composer-2.5", { model: "" }, { model: "x", pausedReason: "r" }],
        },
      ]),
    ).toEqual([
      {
        cli: "cursor",
        models: ["composer-2.5"],
        paused: true,
        pausedUntil: "2026-10-22T09:00:00Z",
        pausedReason: "credits",
        pausedModels: [{ model: "composer-2.5" }, { model: "x", pausedReason: "r" }],
      },
    ]);
  });

  it("keeps favorite timestamps only when they are valid", () => {
    expect(
      sanitizeAgentModelFavorites([
        { cli: "a", model: "m", addedAt: 5, recentlyUsedAt: 9 },
        { cli: "a", model: "m2", addedAt: "yesterday" },
      ]),
    ).toEqual([
      { cli: "a", model: "m", addedAt: 5, recentlyUsedAt: 9 },
      { cli: "a", model: "m2" },
    ]);
  });

  it("dedupes id lists while keeping order", () => {
    expect(sanitizeIdList(["b", "a", "b", "", 42])).toEqual(["b", "a"]);
  });

  it("keeps only known remoteValidation keys with valid types", () => {
    const { config, unknownKeys, droppedKeys } = sanitizeRemoteValidation({
      enabled: true,
      provider: "tailscale",
      maxConcurrent: 2,
      maxServerLifetimeMinutes: 5, // below the documented minimum of 10
      tailscaleHosts: ["bee"],
      tailscaleHost: "",
      nope: 1,
    });
    expect(config).toEqual({
      enabled: true,
      provider: "tailscale",
      maxConcurrent: 2,
      tailscaleHosts: ["bee"],
    });
    expect(unknownKeys).toEqual(["nope"]);
    expect(droppedKeys).toEqual(["maxServerLifetimeMinutes"]);
  });
});

describe("buildImportPatch", () => {
  it("sends maxConcurrent as a string and hosts as a flat list", () => {
    const { patch, warnings } = buildImportPatch({
      budgetAllowlist: [{ cli: "opencode", models: ["a"] }],
      remoteValidation: { enabled: true, provider: "hetzner", maxConcurrent: 3, snapshotId: "s" },
    });
    expect(warnings).toEqual([]);
    expect(patch).toEqual({
      "budget.allowlist": [{ cli: "opencode", models: ["a"] }],
      "remoteValidation.enabled": true,
      "remoteValidation.provider": "hetzner",
      "remoteValidation.maxConcurrent": "3",
      "remoteValidation.snapshotId": "s",
    });
  });

  it("skips invalid values with warnings instead of failing the save", () => {
    const { patch, warnings } = buildImportPatch({
      remoteValidation: { enabled: "yes", maxConcurrent: 99 } as never,
    });
    expect(patch).toEqual({});
    expect(warnings).toHaveLength(2);
  });
});

describe("summarizeSettingsExport", () => {
  it("describes each present section, including empty-means-clear", () => {
    const summary = summarizeSettingsExport(
      { budgetAllowlist: [{ cli: "a", models: ["m"] }], starredThemes: [] },
      ["budgetAllowlist", "starredThemes"],
    );
    expect(summary).toEqual([
      { id: "budgetAllowlist", label: "Agent+Model allowlist", detail: "1 row" },
      { id: "starredThemes", label: "Starred themes", detail: "empty — clears starred themes" },
    ]);
  });
});
