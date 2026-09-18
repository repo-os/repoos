import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkAgentUpdate,
  checkAgentUpdates,
  clearUpdateCache,
  compareSemver,
  parseLatestVersion,
  parseSemver,
  resolveUpdateSource,
  type UpdateSource,
} from "../../core/agent-updates";
import type { DetectedAgent } from "../../core/detect";

const agent = (overrides: Partial<DetectedAgent> = {}): DetectedAgent => ({
  id: "codex",
  name: "codex",
  binary: "codex",
  installed: true,
  path: "/tmp/node_modules/.bin/codex",
  version: "0.155.0",
  headless: true,
  drivable: true,
  installHint: "npm i -g @openai/codex",
  auth: null,
  ...overrides,
});

afterEach(() => {
  clearUpdateCache();
  vi.unstubAllGlobals();
});

describe("safe version comparison", () => {
  it("compares ordinary semver and ignores opaque or date-style versions", () => {
    expect(parseSemver("codex v0.155.0")).toEqual([0, 155, 0]);
    expect(parseSemver("1.2.3.4")).toEqual([1, 2, 3]);
    expect(compareSemver("v1.2.0", "1.10.0")).toBe(-1);
    expect(compareSemver("2026.09.18", "2026.10.01")).toBeNull();
    expect(compareSemver("build-2026-09-18", "1.0.0")).toBeNull();
  });
});

describe("update source adapters", () => {
  it("selects npm only when node_modules proves the channel", () => {
    expect(resolveUpdateSource(agent())).toMatchObject({
      kind: "npm",
      packageName: "@openai/codex",
    });
    expect(resolveUpdateSource(agent({ path: "/usr/local/bin/codex" }))).toBeNull();
  });

  it("supports Homebrew metadata and GitHub release fixtures", () => {
    expect(
      resolveUpdateSource(agent({ id: "aider", path: "/opt/homebrew/Cellar/aider/bin/aider" })),
    ).toMatchObject({ kind: "homebrew", formula: "aider" });
    expect(
      resolveUpdateSource(agent({ id: "goose", path: "/Users/me/.local/bin/goose" })),
    ).toMatchObject({ kind: "github", repo: "goose" });
  });

  it("parses adapter-specific stable version fields", () => {
    const npm: UpdateSource = { kind: "npm", label: "npm", url: "" };
    const brew: UpdateSource = { kind: "homebrew", label: "brew", url: "" };
    const github: UpdateSource = { kind: "github", label: "github", url: "" };
    expect(parseLatestVersion(npm, { version: "1.2.3" })).toBe("1.2.3");
    expect(parseLatestVersion(brew, { versions: { stable: "2.0.0" } })).toBe("2.0.0");
    expect(parseLatestVersion(github, { tag_name: "v3.0.0" })).toBe("v3.0.0");
  });
});

describe("fail-soft update checks", () => {
  it("reports an available npm update and a safe command", async () => {
    const result = await checkAgentUpdate(
      agent(),
      async (url) => {
        expect(url).toContain("registry.npmjs.org");
        return { status: 200, json: { version: "0.156.0" } };
      },
      "2026-09-18T00:00:00.000Z",
    );
    expect(result).toMatchObject({
      status: "update_available",
      latestVersion: "0.156.0",
      updateCommand: "npm install -g @openai/codex",
    });
  });

  it("returns manual for unsupported channels and unavailable for failures", async () => {
    await expect(checkAgentUpdate(agent({ path: "/usr/local/bin/codex" }))).resolves.toMatchObject({
      status: "manual",
    });
    await expect(
      checkAgentUpdate(agent(), async () => {
        throw new Error("blocked");
      }),
    ).resolves.toMatchObject({ status: "unavailable", error: "blocked" });
    await expect(
      checkAgentUpdate(agent(), async () => ({ status: 200, json: { version: "latest" } })),
    ).resolves.toMatchObject({ status: "manual" });
  });

  it("uses the cached result until refresh is requested", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ version: "0.156.0" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const first = await checkAgentUpdates([agent()], false, 1000);
    const second = await checkAgentUpdates([agent()], false, 1001);
    expect(first.codex.status).toBe("update_available");
    expect(second.codex.status).toBe("update_available");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
