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
  | "updating"
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

/**
 * The release workflow's run for the viewed tag, when it did not succeed.
 * Explains a channel that is out of sync because CI failed after the publish
 * (e.g. the Homebrew tap dispatch step) rather than still propagating.
 */
export interface ReleaseCiFailure {
  runUrl: string;
  /** The first failed job step, e.g. "Request Homebrew tap update". */
  failedStep: string | null;
  jobName: string | null;
}

export interface DistributionSummary {
  /** Set only when the tag's release workflow run concluded unsuccessfully. */
  ciFailure?: ReleaseCiFailure | null;
  /** Version of the release being viewed, or null when none could be resolved. */
  releaseVersion: string | null;
  /** Tag of the release being viewed, or null. */
  releaseTag: string | null;
  channels: DistributionChannel[];
}

/** How long a single registry lookup may take before it's abandoned. */
export const DISTRIBUTION_TIMEOUT_MS = 5_000;

/**
 * After a successful run of the configured release workflow, a lagging Homebrew
 * formula reads as **Updating** instead of **Out of sync** (#1090).
 */
export const DISTRIBUTION_HOMEBREW_GRACE_MS = 5 * 60 * 1000;

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

/** A 404 is not always an unpublished release: GitHub returns it for private/missing raw files. */
function unavailableDetail(channel: DistributionConfig): string {
  if (channel.kind === "homebrew") {
    return "No public Homebrew formula was found at the configured URL.";
  }
  return "Not published yet.";
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
      return { ...base, version: null, state: "unavailable", detail: unavailableDetail(channel) };
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

const GITHUB_JSON_HEADERS = {
  Accept: "application/vnd.github+json",
  "User-Agent": "RepoOS distribution check",
} as const;

type GithubWorkflowRun = {
  id: number;
  html_url: string;
  conclusion: string | null;
  status: string;
  updated_at: string;
};

/** `.github/workflows/release.yml` → `release.yml` for the Actions workflows API. */
export function releaseWorkflowBasename(workflowPath?: string): string | null {
  const trimmed = workflowPath?.trim();
  if (!trimmed) return null;
  const base = trimmed.split("/").pop()?.trim();
  return base || null;
}

/** `https://github.com/owner/tap/...` → `owner/tap`. */
export function githubRepositoryFromUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "github.com") return null;
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return `${parts[0]}/${parts[1]}`;
  } catch {
    return null;
  }
}

async function listReleaseWorkflowRuns(
  repository: string,
  workflowFile: string,
  tag: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<GithubWorkflowRun[]> {
  try {
    const runsRes = await fetchImpl(
      `https://api.github.com/repos/${repository}/actions/workflows/${encodeURIComponent(workflowFile)}/runs?branch=${encodeURIComponent(tag)}&event=push&per_page=5`,
      { headers: GITHUB_JSON_HEADERS, signal: AbortSignal.timeout(timeoutMs) },
    );
    if (!runsRes.ok) return [];
    const runs = ((await runsRes.json()) as { workflow_runs?: GithubWorkflowRun[] }).workflow_runs;
    return runs ?? [];
  } catch {
    return [];
  }
}

async function failedStepForRun(
  repository: string,
  run: GithubWorkflowRun,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<ReleaseCiFailure> {
  const result: ReleaseCiFailure = { runUrl: run.html_url, failedStep: null, jobName: null };
  try {
    const jobsRes = await fetchImpl(
      `https://api.github.com/repos/${repository}/actions/runs/${run.id}/jobs`,
      { headers: GITHUB_JSON_HEADERS, signal: AbortSignal.timeout(timeoutMs) },
    );
    if (!jobsRes.ok) return result;
    const jobs = ((await jobsRes.json()) as { jobs?: Record<string, any>[] }).jobs ?? [];
    for (const job of jobs) {
      const step = (job.steps ?? []).find(
        (st: { conclusion?: string }) => st.conclusion === "failure",
      );
      if (step) {
        result.jobName = String(job.name);
        result.failedStep = String(step.name);
        break;
      }
    }
  } catch {
    /* best effort */
  }
  return result;
}

/**
 * Inspect only the configured release workflow's latest run for `tag` — unrelated
 * workflows that also trigger on the tag never count (#1090).
 */
async function inspectReleaseWorkflow(
  repository: string,
  workflowFile: string,
  tag: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<{ ciFailure: ReleaseCiFailure | null; succeededAt: number | null }> {
  const runs = await listReleaseWorkflowRuns(repository, workflowFile, tag, fetchImpl, timeoutMs);
  if (!runs.length) return { ciFailure: null, succeededAt: null };
  const latest = runs[0]!;
  if (latest.conclusion === "success") {
    const parsed = Date.parse(latest.updated_at);
    return {
      ciFailure: null,
      succeededAt: Number.isFinite(parsed) ? parsed : null,
    };
  }
  if (latest.conclusion === "failure" || latest.conclusion === "timed_out") {
    return {
      ciFailure: await failedStepForRun(repository, latest, fetchImpl, timeoutMs),
      succeededAt: null,
    };
  }
  return { ciFailure: null, succeededAt: null };
}

const TAP_ACTIVE_STATUSES = new Set(["in_progress", "queued", "waiting", "requested", "pending"]);

async function homebrewTapUpdateInProgress(
  tapRepository: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<boolean> {
  try {
    const res = await fetchImpl(
      `https://api.github.com/repos/${tapRepository}/actions/runs?per_page=10`,
      { headers: GITHUB_JSON_HEADERS, signal: AbortSignal.timeout(timeoutMs) },
    );
    if (!res.ok) return false;
    const runs =
      ((await res.json()) as { workflow_runs?: { status?: string }[] }).workflow_runs ?? [];
    return runs.some(
      (run) => typeof run.status === "string" && TAP_ACTIVE_STATUSES.has(run.status),
    );
  } catch {
    return false;
  }
}

function applyHomebrewUpdatingState(
  channels: DistributionChannel[],
  configured: DistributionConfig[],
  releaseSucceededAt: number | null,
  tapInProgressByRepo: ReadonlyMap<string, boolean>,
  nowMs: number,
): void {
  const inGrace =
    releaseSucceededAt !== null && nowMs - releaseSucceededAt < DISTRIBUTION_HOMEBREW_GRACE_MS;
  for (let i = 0; i < channels.length; i++) {
    const channel = channels[i]!;
    const cfg = configured[i]!;
    if (cfg.kind !== "homebrew" || channel.state !== "out-of-sync") continue;
    const tapRepo = githubRepositoryFromUrl(channel.url ?? cfg.url);
    const tapBusy = tapRepo ? (tapInProgressByRepo.get(tapRepo) ?? false) : false;
    if (!inGrace && !tapBusy) continue;
    channel.state = "updating";
    channel.detail = tapBusy
      ? "The Homebrew tap workflow is still running."
      : "The formula usually catches up within a few minutes after release.";
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
  options?: { nowMs?: number },
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
  const repository = config.release?.repository;
  const tag = release?.tag;
  const workflowFile = releaseWorkflowBasename(config.release?.workflow);
  const needsCiContext =
    repository && tag && workflowFile && summary.channels.some((c) => c.state !== "matching");
  let releaseSucceededAt: number | null = null;
  if (needsCiContext) {
    const inspected = await inspectReleaseWorkflow(
      repository,
      workflowFile,
      tag,
      fetchImpl,
      timeoutMs,
    );
    summary.ciFailure = inspected.ciFailure;
    releaseSucceededAt = inspected.succeededAt;
  }
  const nowMs = options?.nowMs ?? Date.now();
  const tapRepos = new Set<string>();
  for (let i = 0; i < summary.channels.length; i++) {
    const channel = summary.channels[i]!;
    const cfg = configured[i]!;
    if (cfg.kind !== "homebrew" || channel.state !== "out-of-sync") continue;
    const tapRepo = githubRepositoryFromUrl(channel.url ?? cfg.url);
    if (tapRepo) tapRepos.add(tapRepo);
  }
  const tapInProgressByRepo = new Map<string, boolean>();
  if (tapRepos.size) {
    await Promise.all(
      [...tapRepos].map(async (repo) => {
        tapInProgressByRepo.set(
          repo,
          await homebrewTapUpdateInProgress(repo, fetchImpl, timeoutMs),
        );
      }),
    );
  }
  applyHomebrewUpdatingState(
    summary.channels,
    configured,
    releaseSucceededAt,
    tapInProgressByRepo,
    nowMs,
  );
  return summary;
}
