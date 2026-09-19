/**
 * Distribution status for the Releases page's "Published to" summary (#0445).
 *
 * Each configured `[[distribution]]` channel names a place users install a
 * release from. This module answers one question per channel — "what version is
 * currently published there?" — using a **public, credential-free** lookup, so
 * the browser never sees a registry token or repository secret.
 *
 * Three properties the callers depend on:
 *
 * - **Bounded.** Every lookup gets its own timeout (default 5s). A slow or dead
 *   registry can't hang the endpoint.
 * - **Isolated.** Channels are resolved independently and every failure is
 *   caught per channel: an npm outage leaves the Homebrew row intact rather
 *   than failing the whole section, and never blocks the Releases page itself
 *   (the UI fetches this separately from `/api/release`).
 * - **Truthful.** A channel whose version can't be read reports `unverified` or
 *   `failed`, never a guessed "published". Only a version that matches the
 *   release being viewed reports `matching`.
 */
import type { DistributionConfig, DistributionKind, RepoOSConfig } from "../core/types.js";

export type DistributionState =
  | "matching"
  | "out-of-sync"
  | "unverified"
  | "unavailable"
  | "failed";

export interface DistributionChannel {
  name: string;
  /** The configured lookup kind, or null when none was recognized. */
  kind: DistributionKind | null;
  /** Source link with `{tag}`/`{version}` resolved; null when unresolved. */
  url: string | null;
  /** Install commands, each independently copyable. */
  install: string[];
  /** Latest version published on this channel, or null when it couldn't be read. */
  version: string | null;
  state: DistributionState;
  detail: string | null;
}

export interface DistributionSummary {
  /** Version of the release being viewed, or null when none could be resolved. */
  releaseVersion: string | null;
  /** Tag of the release being viewed, or null. */
  releaseTag: string | null;
  channels: DistributionChannel[];
}

/** How long a single registry lookup may take before it's abandoned. */
export const DISTRIBUTION_TIMEOUT_MS = 5_000;

export interface DistributionRelease {
  version: string | null;
  tag: string | null;
}

type VersionLookup =
  | { format: "json"; url: string; extract: (data: unknown) => string | null }
  | { format: "text"; url: string; extract: (text: string) => string | null };

/** `v1.2.3` / `release-1.2.3` → `1.2.3`. Keeps a bare version unchanged. */
export function stripVersionPrefix(value: string): string {
  return value.trim().replace(/^[^0-9]+/, "");
}

function extractWithRegex(text: string, pattern: string): string | null {
  try {
    const match = text.match(new RegExp(pattern, "m"));
    return match?.[1]?.trim() || null;
  } catch {
    return null;
  }
}

function jsonVersion(data: unknown): string | null {
  const version = (data as { version?: unknown } | null)?.version;
  return typeof version === "string" && version.trim() ? version.trim() : null;
}

function githubTag(data: unknown): string | null {
  const tag = (data as { tag_name?: unknown } | null)?.tag_name;
  return typeof tag === "string" && tag.trim() ? stripVersionPrefix(tag) : null;
}

/**
 * The public endpoint and value extractor for a channel's `kind`, or null when
 * the channel opts out of (or is missing the data for) an automatic check.
 */
export function versionLookup(channel: DistributionConfig): VersionLookup | null {
  switch (channel.kind) {
    case "npm": {
      const url =
        channel.versionUrl ??
        (channel.package
          ? `https://registry.npmjs.org/${encodeURIComponent(channel.package)}/latest`
          : null);
      return url ? { format: "json", url, extract: jsonVersion } : null;
    }
    case "github-release": {
      const url =
        channel.versionUrl ??
        (channel.repository
          ? `https://api.github.com/repos/${channel.repository}/releases/latest`
          : null);
      return url ? { format: "json", url, extract: githubTag } : null;
    }
    case "homebrew": {
      if (!channel.versionUrl) return null;
      const pattern = channel.versionRegex ?? '^\\s*version\\s+"([^"]+)"';
      return {
        format: "text",
        url: channel.versionUrl,
        extract: (text) => extractWithRegex(text, pattern),
      };
    }
    case "custom": {
      if (!channel.versionUrl || !channel.versionRegex) return null;
      return {
        format: "text",
        url: channel.versionUrl,
        extract: (text) => extractWithRegex(text, channel.versionRegex!),
      };
    }
    default:
      return null;
  }
}

/** Substitute `{tag}`/`{version}`; null when the template needs a value we lack. */
export function resolveChannelUrl(
  template: string | undefined,
  release: DistributionRelease | null,
): string | null {
  if (!template) return null;
  const tag = release?.tag ?? "";
  const version = release?.version ?? "";
  if ((template.includes("{tag}") && !tag) || (template.includes("{version}") && !version)) {
    return null;
  }
  return template.replace(/\{tag\}/g, tag).replace(/\{version\}/g, version);
}

function compare(
  version: string,
  release: DistributionRelease | null,
): {
  state: DistributionState;
  detail: string | null;
} {
  if (!release?.version) {
    return {
      state: "unverified",
      detail: "Latest on this channel; no release to compare against.",
    };
  }
  if (version === release.version) return { state: "matching", detail: null };
  return {
    state: "out-of-sync",
    detail: `Channel is at ${version}; this release is ${release.version}.`,
  };
}

async function resolveChannel(
  channel: DistributionConfig,
  release: DistributionRelease | null,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<DistributionChannel> {
  const base = {
    name: channel.name,
    kind: channel.kind ?? null,
    url: resolveChannelUrl(channel.url, release),
    install: channel.install ?? [],
  };
  const lookup = versionLookup(channel);
  if (!lookup) {
    return {
      ...base,
      version: null,
      state: "unverified",
      detail: "No automatic version check configured for this channel.",
    };
  }
  try {
    const response = await fetchImpl(lookup.url, {
      headers: {
        Accept: lookup.format === "json" ? "application/json" : "text/plain",
        "User-Agent": "RepoOS distribution check",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status === 404) {
      return { ...base, version: null, state: "unavailable", detail: "Not published yet." };
    }
    if (!response.ok) {
      return {
        ...base,
        version: null,
        state: "failed",
        detail: `The registry returned ${response.status}.`,
      };
    }
    const version =
      lookup.format === "json"
        ? lookup.extract(await response.json())
        : lookup.extract(await response.text());
    if (!version) {
      return {
        ...base,
        version: null,
        state: "unverified",
        detail: "Couldn't read a published version.",
      };
    }
    return { ...base, version, ...compare(version, release) };
  } catch (err) {
    const timeout = err instanceof Error && err.name === "TimeoutError";
    return {
      ...base,
      version: null,
      state: "failed",
      detail: timeout ? "The version lookup timed out." : "The version lookup failed.",
    };
  }
}

/**
 * Resolve every configured channel's published version. Never rejects: a
 * failed channel is reported in its own row so the rest of the summary (and the
 * page) is unaffected. Returns an empty channel list for an unconfigured repo.
 */
export async function getDistributionStatus(
  config: RepoOSConfig,
  release: DistributionRelease | null,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = DISTRIBUTION_TIMEOUT_MS,
): Promise<DistributionSummary> {
  const configured = config.distribution ?? [];
  const summary: DistributionSummary = {
    releaseVersion: release?.version ?? null,
    releaseTag: release?.tag ?? null,
    channels: [],
  };
  if (!configured.length) return summary;
  summary.channels = await Promise.all(
    configured.map((channel) => resolveChannel(channel, release, fetchImpl, timeoutMs)),
  );
  return summary;
}
