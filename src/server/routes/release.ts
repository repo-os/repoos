import type { RouteHandler } from "./types.js";
import { json, readBody } from "./utils.js";
import {
  collectReleaseCommits,
  cutNewRelease,
  getReleaseStatus,
  releaseNotesPrompt,
  type ReleasePhase,
} from "../release.js";
import {
  extractOneShotReportText,
  pmCommand,
  recordOneShotSession,
  resolveEngineer,
  resolvePmAgent,
  runPrompt,
} from "../agents.js";
import type { Agent, RepoOSConfig } from "../../core/types.js";
import { readBuildMeta } from "../../core/build.js";
import { compareSemver } from "../../core/agent-updates.js";

const STABLE_VERSION = /^v?(\d+)\.(\d+)\.(\d+)$/;
const RELEASE_CACHE_MS = 10 * 60 * 1000;
const RELEASE_FAILURE_CACHE_MS = 60 * 1000;
let releaseCache: { value: AvailableRelease; expiresAt: number } | null = null;
let releaseFailureUntil = 0;
let releaseRequest: Promise<AvailableRelease | null> | null = null;

export interface AvailableRelease {
  currentVersion: string | null;
  latestVersion: string | null;
  available: boolean;
  releaseNotes: string | null;
  releaseUrl: string | null;
}

function versionParts(version: string): [number, number, number] | null {
  const match = version.trim().match(STABLE_VERSION);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

export function isStableRelease(release: { tag_name?: unknown; prerelease?: unknown }): boolean {
  return (
    release.prerelease !== true &&
    typeof release.tag_name === "string" &&
    versionParts(release.tag_name) !== null
  );
}

export function isNewerVersion(latest: string, current: string | null): boolean {
  if (!latest || !isStableRelease({ tag_name: latest, prerelease: false })) return false;
  if (!current) return false;
  const compared = compareSemver(latest, current);
  return compared !== null && compared > 0;
}

async function fetchAvailableRelease(): Promise<AvailableRelease | null> {
  const currentVersion = readBuildMeta().version;
  if (process.env.REPOOS_DISABLE_UPDATE_CHECK === "1") return null;
  try {
    const response = await fetch("https://api.github.com/repos/repo-os/repoos/releases/latest", {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "RepoOS update checker",
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);
    const candidate = (await response.json()) as {
      tag_name?: unknown;
      prerelease?: unknown;
      body?: unknown;
      html_url?: unknown;
    };
    const latestVersion =
      isStableRelease(candidate) && typeof candidate.tag_name === "string"
        ? candidate.tag_name.replace(/^v/, "")
        : null;
    return {
      currentVersion,
      latestVersion,
      available:
        latestVersion !== null &&
        currentVersion !== null &&
        isNewerVersion(latestVersion, currentVersion),
      releaseNotes:
        typeof candidate.body === "string" && candidate.body.trim() ? candidate.body : null,
      releaseUrl:
        typeof candidate.html_url === "string"
          ? candidate.html_url
          : "https://github.com/repo-os/repoos/releases",
    };
  } catch {
    return null;
  }
}

export const getAvailableRelease: RouteHandler = async (_ctx, _req, res) => {
  const now = Date.now();
  if (releaseCache && releaseCache.expiresAt > now) return json(res, 200, releaseCache.value);
  const fallback: AvailableRelease = {
    currentVersion: readBuildMeta().version,
    latestVersion: null,
    available: false,
    releaseNotes: null,
    releaseUrl: "https://github.com/repo-os/repoos/releases",
  };
  if (releaseFailureUntil > now) return json(res, 200, fallback);
  releaseRequest ??= fetchAvailableRelease().finally(() => {
    releaseRequest = null;
  });
  const value = await releaseRequest;
  if (value) {
    releaseCache = { value, expiresAt: Date.now() + RELEASE_CACHE_MS };
    return json(res, 200, value);
  }
  releaseFailureUntil = Date.now() + RELEASE_FAILURE_CACHE_MS;
  return json(res, 200, fallback);
};

export interface ReleaseRun {
  state: "idle" | "running" | "succeeded" | "failed";
  phase: ReleasePhase | null;
  message: string;
  startedAt: string | null;
  updatedAt: string | null;
}

/**
 * Which agent drafts release notes. The PM owns authoring, so prefer it; fall
 * back to the engineer when a repo has the PM disabled. Null means neither is
 * enabled and the generate button should report that rather than fail opaquely.
 */
function releaseNotesAgent(config: RepoOSConfig): Agent | null {
  return resolvePmAgent(config) ?? resolveEngineer(config);
}

let run: ReleaseRun = { state: "idle", phase: null, message: "", startedAt: null, updatedAt: null };

function updateRun(
  phase: ReleasePhase | null,
  message: string,
  state: ReleaseRun["state"] = "running",
): void {
  run = {
    state,
    phase,
    message,
    startedAt: run.startedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export const getRelease: RouteHandler = async (ctx, _req, res) =>
  json(res, 200, await getReleaseStatus(ctx.config));

export const getReleaseRun: RouteHandler = (_ctx, _req, res) => json(res, 200, run);

export const runRelease: RouteHandler = async (ctx, req, res) => {
  const body = (await readBody(req)) as {
    version?: unknown;
    confirmTag?: unknown;
    notes?: unknown;
  };
  if (typeof body.version !== "string" || typeof body.confirmTag !== "string")
    return json(res, 400, { error: "version and confirmTag are required" });
  if (run.state === "running")
    return json(res, 409, { error: "A release is already running", run });
  const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes : undefined;
  run = {
    state: "running",
    phase: "preparing",
    message: "Starting release…",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  void cutNewRelease(
    ctx.config,
    body.version,
    body.confirmTag,
    undefined,
    (phase, message) => updateRun(phase, message),
    ctx.remoteValidator,
    notes,
  )
    // Keep the phase that was in flight when it failed, so the UI can say
    // "failed during checking" rather than a bare "failed".
    .then((result) =>
      updateRun(result.ok ? null : run.phase, result.output, result.ok ? "succeeded" : "failed"),
    )
    .catch(() =>
      updateRun(
        null,
        "Release runner stopped unexpectedly. Check the repository state before retrying.",
        "failed",
      ),
    );
  return json(res, 202, { ok: true, run });
};

/**
 * Draft release notes from the commits since the last release (full history
 * when there is none) with the repo's one-shot LLM plumbing. This never cuts a
 * release — it only returns text for the modal to drop into its optional notes
 * field, where the operator can edit it before confirming the cut. A failure
 * here is reported to the caller and has no effect on the cut flow.
 */
export const generateReleaseNotes: RouteHandler = async (ctx, req, res) => {
  const { config } = ctx;
  const body = (await readBody(req)) as { version?: unknown };
  const version = typeof body.version === "string" && body.version.trim() ? body.version : null;

  const agent = releaseNotesAgent(config);
  if (!agent) {
    return json(res, 400, {
      error: "No agent is enabled to draft release notes — enable the PM or Engineer agent.",
    });
  }

  const { commits, sinceTag, truncated } = await collectReleaseCommits(config);
  if (!commits.length) {
    // Nothing new to summarize is not an error: the cut can still proceed.
    return json(res, 200, { notes: "", sinceTag, commitCount: 0, truncated });
  }

  const prompt = releaseNotesPrompt(commits, { sinceTag, version, truncated });
  const result = await runPrompt(agent, prompt, {
    cwd: config.root,
    // Structured output so extractUsage records real tokens/cost for this
    // board-level call (house rule: every one-shot LLM call is recorded).
    command: pmCommand(agent, prompt, config.root),
  });
  recordOneShotSession(config.root, agent, result, {
    sessionType: "release-notes",
    taskId: null,
  });

  if (!result.ok || !result.output) {
    return json(res, 502, { error: result.error ?? "The agent returned no release notes." });
  }
  const notes = extractOneShotReportText(agent.cli, result.output);
  if (!notes) {
    return json(res, 502, { error: "The agent returned no usable release notes." });
  }
  return json(res, 200, { notes, sinceTag, commitCount: commits.length, truncated });
};
