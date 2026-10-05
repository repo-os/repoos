import type { RouteContext, RouteHandler } from "./types.js";
import { json, readBody } from "./utils.js";
import {
  collectReleaseCommits,
  cutNewRelease,
  findUnpushedReleaseNotes,
  getReleaseStatus,
  releaseNotesPrompt,
  type ReleasePhase,
  type ReleaseStatus,
} from "../release.js";
import {
  getDistributionStatus,
  stripVersionPrefix,
  type DistributionRelease,
} from "../distribution.js";
import {
  extractOneShotReportText,
  debuggerAgent,
  pmCommand,
  recordOneShotSession,
  resolveEngineer,
  resolvePmAgent,
  runPrompt,
} from "../agents.js";
import type { Agent, RepoOSConfig } from "../../core/types.js";
import { getCheckStore } from "../../core/check-store.js";
import { extractFailedTests } from "../../core/check-failure-summary.js";
import { sanitizeTldrAnswer } from "../debug-tldr.js";
import { redactSecrets } from "./debugger.js";
import { readBuildMeta } from "../../core/build.js";
import { compareSemver } from "../../core/agent-updates.js";
import {
  readCachedReleaseNotes,
  releaseNotesCacheKey,
  writeCachedReleaseNotes,
} from "../release-notes-cache.js";

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
  /** Failing tests (`file > suite > test`) when a failed run's checks recorded any. */
  failedTests?: string[];
  /** Debugger's one-line "what happened / what to do" for a failed run. */
  tldr?: string | null;
  /** True while the Debugger is still writing the tl;dr. */
  tldrPending?: boolean;
}

/**
 * The server-tracked state of an AI release-notes draft run (#0605), shaped
 * like `ReleaseRun` above so the modal can treat both the same way: a POST
 * starts the run detached and returns 202 immediately (reopening the modal —
 * or a second click — can then observe "Drafting…" instead of re-running the
 * agent), and the modal polls until the draft arrives or the run fails.
 * In-memory and reset on restart, like the release run state.
 */
export interface ReleaseNotesRun {
  state: "idle" | "running" | "succeeded" | "failed";
  startedAt: string | null;
  updatedAt: string | null;
  /** Failure text — meaningful only when `failed`. */
  error: string | null;
  /** Commit-context cache key the draft was made for (see release-notes-cache.ts). */
  key: string | null;
  /** HEAD the run was started from, retained for diagnostics. */
  head: string | null;
  /** The draft — meaningful only when `succeeded`. */
  notes: string | null;
  sinceTag: string | null;
  commitCount: number;
  truncated: boolean;
  /**
   * Set on read: the run's HEAD no longer matches the repo's current HEAD, so
   * a terminal result describes an older draft context and must not be
   * presented as current (#0630 review).
   */
  stale: boolean;
}

const idleNotesRun = (): ReleaseNotesRun => ({
  state: "idle",
  startedAt: null,
  updatedAt: null,
  error: null,
  key: null,
  head: null,
  notes: null,
  sinceTag: null,
  commitCount: 0,
  truncated: false,
  stale: false,
});

let notesRun: ReleaseNotesRun = idleNotesRun();
let notesRunInFlight: Promise<void> | null = null;

/** Test seam: resolves once any in-flight detached draft run settles (#0605). */
export async function whenNotesRunSettles(): Promise<void> {
  if (notesRunInFlight) await notesRunInFlight;
}

/**
 * The tracked draft run. A terminal snapshot is annotated with `stale` by
 * comparing its cache key to the current release-notes context — relevant
 * commit SHAs plus `sinceTag`. The server keeps its last terminal run forever,
 * so without this an old success could claim "Generate with AI will reuse it"
 * after the cache context changed (#0630 review).
 */
export const getReleaseNotesRun: RouteHandler = async (ctx, _req, res) => {
  const { config } = ctx;
  if (notesRun.state !== "succeeded" && notesRun.state !== "failed") {
    return json(res, 200, notesRun);
  }
  const current = await collectReleaseCommits(config);
  if (!current.head) return json(res, 200, notesRun);
  const currentKey = current.relevantShas.length
    ? releaseNotesCacheKey(current.relevantShas, current.sinceTag)
    : null;
  const stale = notesRun.key !== currentKey;
  return json(res, 200, stale ? { ...notesRun, stale } : notesRun);
};

/**
 * The newest AI-drafted notes that were generated but never pushed with a
 * release (#0641). The panel shows them below the Generate button so an
 * operator can decide to reuse them for a retry after a failed cut.
 */
export const getUnpushedReleaseNotes: RouteHandler = async (ctx, _req, res) =>
  json(res, 200, await findUnpushedReleaseNotes(ctx.config));

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
  extra: Pick<ReleaseRun, "failedTests" | "tldrPending"> = {},
): void {
  run = {
    state,
    phase,
    message,
    startedAt: run.startedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...extra,
  };
}

/**
 * The failing tests behind a failed release: the check history rows this run
 * wrote (release phase, newest first, since the run started), falling back to
 * parsing the captured output when the store has none.
 */
function releaseFailedTests(config: RepoOSConfig, startedAt: string | null, output: string) {
  const since = startedAt ? Date.parse(startedAt) : 0;
  try {
    const rows = getCheckStore(config.root, config.cacheDir).list({ limit: 20 });
    const seen = new Set<string>();
    for (const r of rows) {
      if (r.phase !== "release" || r.outcome !== "fail") continue;
      if (Date.parse(r.startedAt) < since - 5000) continue;
      for (const t of r.failedTests) seen.add(t);
    }
    if (seen.size) return [...seen];
  } catch {
    /* fall through to the output */
  }
  return extractFailedTests(output);
}

function releaseTldrPrompt(phase: ReleasePhase | null, output: string, tests: string[]): string {
  return [
    "You are the Debugger for RepoOS. A release cut just failed and the human is looking",
    "at raw logs. Write the ONE-LINE tl;dr for the failure panel.",
    "",
    "Answer with EXACTLY ONE sentence of plain text and nothing else: no markdown,",
    "no quotes, no preamble. Name what happened and the concrete next action, e.g.:",
    '"serve-reaper.test.ts failed under load — likely a flake, cut again; if it repeats, fix the test."',
    "Keep it under 160 characters. If it looks like a known flake (timeouts, memory",
    "pressure) say retrying is reasonable; if it looks like a real regression, say what to fix.",
    "",
    `Failed during: ${phase ?? "the run"}`,
    `Failed tests: ${tests.length ? tests.join("; ") : "(none recorded)"}`,
    "",
    "Release output tail (secrets redacted):",
    redactSecrets(output).slice(-RELEASE_TLDR_LOG_CHARS),
  ].join("\n");
}
const RELEASE_TLDR_LOG_CHARS = 4000;

/** Detached: write the Debugger's tl;dr onto the failed run when it arrives. */
async function writeReleaseTldr(
  config: RepoOSConfig,
  startedAt: string | null,
  phase: ReleasePhase | null,
  output: string,
  tests: string[],
): Promise<void> {
  const settle = (tldr: string | null): void => {
    // A newer run (or a retry) owns the state now — never stamp it.
    if (run.startedAt !== startedAt || run.state !== "failed") return;
    run = { ...run, tldr, tldrPending: false };
  };
  try {
    const state = config.builtInAgents?.debugger ?? {};
    const agent = debuggerAgent({
      cli: typeof state.cli === "string" && state.cli.trim() ? state.cli.trim() : undefined,
      model: typeof state.model === "string" && state.model.trim() ? state.model.trim() : undefined,
    });
    const result = await runPrompt(agent, releaseTldrPrompt(phase, output, tests), {
      cwd: config.root,
    });
    recordOneShotSession(config.root, agent, result, { sessionType: "debugger", taskId: null });
    settle(result.ok ? sanitizeTldrAnswer(agent.cli, result.output ?? "") : null);
  } catch {
    settle(null);
  }
}

export const getRelease: RouteHandler = async (ctx, _req, res) =>
  json(res, 200, await getReleaseStatus(ctx.config));

export const getReleaseRun: RouteHandler = (_ctx, _req, res) => json(res, 200, run);

/** Read the in-memory release run for the attention feed (#0687). */
export function getReleaseRunState(): ReleaseRun {
  return run;
}

/**
 * The release the Releases page is currently showing: the tagged manifest
 * version when it exists, else the newest tag. Null when there's nothing.
 */
function viewedRelease(status: ReleaseStatus): DistributionRelease {
  if (status.released && status.version) {
    return { version: status.version, tag: status.tag };
  }
  if (status.latestTag) {
    return { version: stripVersionPrefix(status.latestTag), tag: status.latestTag };
  }
  return { version: null, tag: null };
}

/**
 * The "Published to" summary for the viewed release. Kept off `/api/release`:
 * it does bounded public network lookups, and a registry outage must never
 * delay or fail the page's main status fetch (#0445).
 */
export const getReleaseDistribution: RouteHandler = async (ctx, _req, res) => {
  const status = await getReleaseStatus(ctx.config);
  return json(res, 200, await getDistributionStatus(ctx.config, viewedRelease(status)));
};

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
    .then((result) => {
      if (result.ok) return updateRun(null, result.output, "succeeded");
      const startedAt = run.startedAt;
      const phase = run.phase;
      const failedTests = releaseFailedTests(ctx.config, startedAt, result.output);
      updateRun(phase, result.output, "failed", { failedTests, tldrPending: true });
      void writeReleaseTldr(ctx.config, startedAt, phase, result.output, failedTests);
    })
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
 * release — it only produces text for the modal to drop into its optional
 * notes field, where the operator can edit it before confirming the cut.
 *
 * Tracked like the release run (#0605): the request resolves as soon as the
 * run is *started* (202 + the run state); a second POST while one is in
 * flight returns the existing run instead of spawning another agent. The
 * modal polls `GET /api/release/notes/run` and fills when the draft is
 * ready — so closing the modal mid-run no longer loses the result.
 *
 * Synchronous short-circuits keep their instant responses: no enabled agent
 * (400), nothing release-relevant to summarize (200, empty), and a draft for
 * this exact commit context already on disk (200 + `cached: true`, #0590).
 * `{ cachedOnly: true }` turns the POST into a pure cache lookup (a miss is
 * 200 with empty notes), which the panel uses on open.
 * A failure of the *agent run* is not instant — it lands in the run state.
 */
export const generateReleaseNotes: RouteHandler = async (ctx, req, res) => {
  const { config, emitEvent } = ctx;

  // A second click while a draft is being generated must return the run
  // already in flight, not spawn a second agent (#0605). Any POST that
  // arrives after the run started gets the same 202 back; the modal's own
  // drafting flag guards the double-click window before the run state
  // exists (the release run dedup has the same shape).
  if (notesRun.state === "running") {
    return json(res, 202, { ok: true, run: notesRun });
  }

  const body = (await readBody(req)) as { version?: unknown; cachedOnly?: unknown };
  const version = typeof body.version === "string" && body.version.trim() ? body.version : null;
  // Lookup only: the panel asks on open whether a saved draft already exists
  // for the current commits. A miss answers 200 with empty notes and never
  // starts an agent run (and needs no enabled agent to do so).
  const cachedOnly = body.cachedOnly === true;

  const agent = releaseNotesAgent(config);
  if (!agent && !cachedOnly) {
    return json(res, 400, {
      error: "No agent is enabled to draft release notes — enable the PM or Engineer agent.",
    });
  }

  const { commits, sinceTag, truncated, head, relevantShas } = await collectReleaseCommits(config);
  if (!relevantShas.length) {
    // Nothing release-relevant to summarize is not an error: the cut can
    // still proceed. (No commits at all, or only work-dir bookkeeping — the
    // latter is exactly the case every task move used to re-run the agent
    // for, see #0605.)
    return json(res, 200, { notes: "", sinceTag, commitCount: 0, truncated });
  }

  // The draft's identity is the release-relevant commit context it was made
  // from — see release-notes-cache.ts for why sinceTag is compounded onto the
  // relevant SHA hash (#0605). A context we couldn't resolve (no readable
  // HEAD) is never cached in either direction: an unkeyed entry could only
  // ever be wrong.
  const cacheKey = head ? releaseNotesCacheKey(relevantShas, sinceTag) : null;
  if (cacheKey) {
    const cached = readCachedReleaseNotes(config.root, config.cacheDir, cacheKey);
    if (cached) {
      return json(res, 200, {
        notes: cached.notes,
        sinceTag,
        commitCount: relevantShas.length,
        truncated,
        cached: true,
        cachedAt: cached.createdAt || null,
      });
    }
  }

  if (cachedOnly || !agent) {
    return json(res, 200, { notes: "", sinceTag, commitCount: relevantShas.length, truncated });
  }

  const prompt = releaseNotesPrompt(commits, { sinceTag, version, truncated });
  const startedAt = new Date().toISOString();
  notesRun = {
    state: "running",
    startedAt,
    updatedAt: startedAt,
    error: null,
    key: cacheKey,
    head,
    notes: null,
    sinceTag,
    commitCount: relevantShas.length,
    truncated,
    stale: false,
  };
  emitEvent({ type: "release.notesRun", state: "running", at: startedAt });
  notesRunInFlight = draftNotes(config, agent, prompt, { cacheKey, head, sinceTag }, emitEvent)
    .catch(() => {
      // draftNotes never rejects — this guards the seam only, so an unexpected
      // throw cannot surface as an unhandled rejection alongside the failed
      // run state the UI reads.
    })
    .finally(() => {
      notesRunInFlight = null;
    });
  return json(res, 202, { ok: true, run: notesRun });
};

/**
 * The detached half of `generateReleaseNotes`: run the agent, record the
 * usage (house rule — every one-shot call lands in `sessions`), cache the
 * draft when it succeeded and the commit context was keyable, and move the
 * tracked run state to `succeeded`/`failed`.
 */
async function draftNotes(
  config: RepoOSConfig,
  agent: Agent,
  prompt: string,
  meta: { cacheKey: string | null; head: string | null; sinceTag: string | null },
  emitEvent: RouteContext["emitEvent"],
): Promise<void> {
  const stamp = () => new Date().toISOString();
  const fail = (error: string): void => {
    notesRun = { ...notesRun, state: "failed", error, notes: null, updatedAt: stamp() };
    emitEvent({ type: "release.notesRun", state: "failed", error, at: notesRun.updatedAt! });
  };
  try {
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
      fail(result.error ?? "The agent returned no release notes.");
      return;
    }
    const notes = extractOneShotReportText(agent.cli, result.output);
    if (!notes) {
      fail("The agent returned no usable release notes.");
      return;
    }
    // Only a successful, non-empty draft reaches the cache, so a failed run
    // can never overwrite a good entry.
    if (meta.cacheKey) {
      writeCachedReleaseNotes(config.root, config.cacheDir, meta.cacheKey, notes, {
        head: meta.head ?? "",
        sinceTag: meta.sinceTag,
      });
    }
    notesRun = { ...notesRun, state: "succeeded", notes, error: null, updatedAt: stamp() };
    emitEvent({ type: "release.notesRun", state: "succeeded", at: notesRun.updatedAt! });
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}
