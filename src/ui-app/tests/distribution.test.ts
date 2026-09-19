/**
 * Coverage for distribution destinations (#0445): the `[[distribution]]`
 * config shape (parsing/validation), the version lookups behind the Releases
 * page's "Published to" summary (success, mismatch, unavailable, failure, and
 * per-channel isolation), and URL placeholder resolution.
 */
import { describe, expect, it, vi } from "vitest";
import { parseDistributionConfig } from "../../core/config";
import {
  getDistributionStatus,
  resolveChannelUrl,
  stripVersionPrefix,
} from "../../server/distribution";
import type { DistributionConfig, RepoOSConfig } from "../../core/types";

function config(distribution?: DistributionConfig[]): RepoOSConfig {
  return {
    root: "/repo",
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
    distribution,
  };
}

function fakeFetch(handler: (url: string) => Response | Promise<Response>): typeof fetch {
  return (async (input: RequestInfo | URL) => handler(String(input))) as typeof fetch;
}

const release = { version: "1.2.3", tag: "v1.2.3" };

describe("parseDistributionConfig", () => {
  it("parses a full channel and a single-string install command", () => {
    const parsed = parseDistributionConfig({
      distribution: [
        {
          name: "npm",
          kind: "npm",
          package: "@scope/name",
          url: "https://www.npmjs.com/package/@scope/name",
          install: [
            "npm install -g @scope/name",
            "bun add -g @scope/name",
            "pnpm add -g @scope/name",
          ],
        },
        {
          name: "Homebrew",
          kind: "homebrew",
          versionUrl: "https://example.com/formula.rb",
          versionRegex: 'version\\s+"([^"]+)"',
          install: "brew install owner/tap/name",
        },
      ],
    });
    expect(parsed).toEqual([
      {
        name: "npm",
        kind: "npm",
        package: "@scope/name",
        url: "https://www.npmjs.com/package/@scope/name",
        install: [
          "npm install -g @scope/name",
          "bun add -g @scope/name",
          "pnpm add -g @scope/name",
        ],
      },
      {
        name: "Homebrew",
        kind: "homebrew",
        versionUrl: "https://example.com/formula.rb",
        versionRegex: 'version\\s+"([^"]+)"',
        install: ["brew install owner/tap/name"],
      },
    ]);
  });

  it("drops a nameless row and validates url, kind, and regex", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const parsed = parseDistributionConfig({
        distribution: [
          { kind: "npm", package: "x" },
          { name: "Bad url", url: "ftp://example.com" },
          { name: "Bad kind", kind: "docker" },
          { name: "Bad regex", kind: "custom", versionUrl: "https://x", versionRegex: "(" },
        ],
      });
      expect(parsed?.map((c) => c.name)).toEqual(["Bad url", "Bad kind", "Bad regex"]);
      expect(parsed?.[0].url).toBeUndefined();
      expect(parsed?.[1].kind).toBeUndefined();
      expect(parsed?.[2].versionRegex).toBeUndefined();
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("returns undefined when nothing usable is declared", () => {
    expect(parseDistributionConfig({})).toBeUndefined();
    expect(parseDistributionConfig({ distribution: [] })).toBeUndefined();
    expect(parseDistributionConfig({ distribution: [{ kind: "npm" }] })).toBeUndefined();
  });
});

describe("distribution version lookups", () => {
  it("reports a matching npm channel", async () => {
    const seen: string[] = [];
    const summary = await getDistributionStatus(
      config([
        {
          name: "npm",
          kind: "npm",
          package: "@scope/name",
          url: "https://www.npmjs.com/package/@scope/name",
          install: ["npm install -g @scope/name"],
        },
      ]),
      release,
      fakeFetch((url) => {
        seen.push(url);
        return new Response(JSON.stringify({ version: "1.2.3" }), { status: 200 });
      }),
    );
    expect(seen).toEqual(["https://registry.npmjs.org/%40scope%2Fname/latest"]);
    expect(summary.channels[0]).toMatchObject({
      name: "npm",
      version: "1.2.3",
      state: "matching",
      detail: null,
      url: "https://www.npmjs.com/package/@scope/name",
    });
  });

  it("flags an out-of-sync channel with both versions", async () => {
    const summary = await getDistributionStatus(
      config([
        { name: "npm", kind: "npm", package: "@scope/name" },
        { name: "Homebrew", kind: "homebrew", versionUrl: "https://example.com/name.rb" },
      ]),
      release,
      fakeFetch((url) =>
        url.includes("registry.npmjs.org")
          ? new Response(JSON.stringify({ version: "1.2.2" }), { status: 200 })
          : new Response('class Name < Formula\n  version "1.2.3"\nend', { status: 200 }),
      ),
    );
    const [npm, brew] = summary.channels;
    expect(npm).toMatchObject({ version: "1.2.2", state: "out-of-sync" });
    expect(npm.detail).toContain("1.2.2");
    expect(npm.detail).toContain("1.2.3");
    expect(brew).toMatchObject({ version: "1.2.3", state: "matching" });
  });

  it("strips a tag prefix from a GitHub release lookup", async () => {
    const summary = await getDistributionStatus(
      config([
        {
          name: "GitHub Releases",
          kind: "github-release",
          repository: "owner/repo",
          url: "https://github.com/owner/repo/releases/tag/{tag}",
        },
      ]),
      release,
      fakeFetch((url) => {
        expect(url).toBe("https://api.github.com/repos/owner/repo/releases/latest");
        return new Response(JSON.stringify({ tag_name: "v1.2.3" }), { status: 200 });
      }),
    );
    expect(summary.channels[0]).toMatchObject({
      version: "1.2.3",
      state: "matching",
      url: "https://github.com/owner/repo/releases/tag/v1.2.3",
    });
  });

  it("reports a 404 as 'not published yet' and a network failure as failed", async () => {
    const summary = await getDistributionStatus(
      config([
        { name: "npm", kind: "npm", package: "@scope/name" },
        { name: "GitHub", kind: "github-release", repository: "owner/repo" },
      ]),
      release,
      fakeFetch((url) => {
        if (url.includes("registry.npmjs.org")) return new Response("", { status: 404 });
        throw new Error("offline");
      }),
    );
    expect(summary.channels[0]).toMatchObject({ state: "unavailable", version: null });
    expect(summary.channels[1]).toMatchObject({ state: "failed", version: null });
  });

  it("keeps one channel's outage from hiding another", async () => {
    const summary = await getDistributionStatus(
      config([
        { name: "npm", kind: "npm", package: "@scope/name" },
        { name: "Homebrew", kind: "homebrew", versionUrl: "https://example.com/name.rb" },
      ]),
      release,
      fakeFetch((url) => {
        if (url.includes("registry.npmjs.org")) throw new Error("registry down");
        return new Response('  version "1.2.3"\n', { status: 200 });
      }),
    );
    expect(summary.channels).toHaveLength(2);
    expect(summary.channels[0].state).toBe("failed");
    expect(summary.channels[1].state).toBe("matching");
  });

  it("never claims a version when none is configured or no release exists", async () => {
    const summary = await getDistributionStatus(
      config([
        { name: "Unchecked", install: ["echo hi"] },
        { name: "npm", kind: "npm", package: "@scope/name" },
      ]),
      null,
      fakeFetch((url) => {
        if (url.includes("registry.npmjs.org"))
          return new Response(JSON.stringify({ version: "9.9.9" }), { status: 200 });
        return new Response("", { status: 404 });
      }),
    );
    expect(summary.releaseVersion).toBeNull();
    expect(summary.channels[0]).toMatchObject({ state: "unverified", version: null });
    expect(summary.channels[1]).toMatchObject({ state: "unverified", version: "9.9.9" });
  });

  it("returns no channels for an unconfigured repo", async () => {
    const summary = await getDistributionStatus(
      config(),
      release,
      fakeFetch(() => new Response()),
    );
    expect(summary.channels).toEqual([]);
  });
});

describe("distribution helpers", () => {
  it("strips leading tag prefixes", () => {
    expect(stripVersionPrefix("v1.2.3")).toBe("1.2.3");
    expect(stripVersionPrefix("release-1.2.3")).toBe("1.2.3");
    expect(stripVersionPrefix("1.2.3")).toBe("1.2.3");
  });

  it("resolves {tag}/{version} and refuses a template it can't fill", () => {
    expect(resolveChannelUrl("https://x/y/tag/{tag}", release)).toBe("https://x/y/tag/v1.2.3");
    expect(resolveChannelUrl("https://x/{version}", release)).toBe("https://x/1.2.3");
    expect(resolveChannelUrl("https://x/tag/{tag}", null)).toBeNull();
    expect(resolveChannelUrl(undefined, release)).toBeNull();
  });
});
