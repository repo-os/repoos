import type { IncomingMessage } from "node:http";
import type { RouteContext, RouteHandler } from "./types.js";
import { json, readBody } from "./utils.js";
import { notifyAttentionReleaseNotesTerminal } from "../attention-notify.js";
import {
  notifyAttentionReleaseAutoPublishFailed,
  notifyAttentionReleaseNotesFailed,
} from "../attention-notify.js";
import {
  collectReleaseCommits,
  cutNewRelease,
  expectsOwnCliRepo,
  findUnpushedReleaseNotes,
  getReleaseStatus,
  isReleaseVersion,
  releaseNotesPrompt,
  releaseTagExists,
  type ReleasePhase,
  type ReleaseStatus,
} from "../release.js";
import { emailProviderConfigured } from "../email.js";
import {
  githubRepository,
  getReleaseEmailRecord,
  previewReleaseEmail,
  resendReleaseEmail,
  unsubscribeReleaseEmail,
  type ReleaseEmailContext,
} from "../release-email.js";
import { readReleaseHistory } from "../release-history.js";
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
import { repoAgentRunTmpOpts } from "../../core/agent-run-tmpdir.js";
import type { Agent, RepoOSConfig } from "../../core/types.js";
import { getCheckStore } from "../../core/check-store.js";
import { extractFailedTests } from "../../core/check-failure-summary.js";
import { sanitizeTldrAnswer } from "../debug-tldr.js";
import { redactSecrets } from "./debugger.js";
import { readBuildMeta } from "../../core/build.js";
import {
  channelFromVersion,
  fetchLatestRelease,
  installRoot,
  readInstallVersion,
  upgradeInstruction,
  type InstallKind,
} from "../../commands/upgrade.js";
import {
  availableReleaseFromGithub,
  isUpdateCheckConfigEnabled,
  isUpdateCheckEnvDisabled,
} from "../../core/update-check.js";
import {
  readCachedReleaseNotes,
  releaseNotesCacheKey,
  writeCachedReleaseNotes,
} from "../release-notes-cache.js";
import {
  isReleaseAutoPublishActive,
  readReleaseAutoPublish,
  writeReleaseAutoPublish,
  type ReleaseAutoPublishRecord,
  type ReleaseWhenReady,
} from "../release-auto-publish.js";
import {
  notificationContextFromConfig,
  notifyReleaseAutoPublishFailed,
  notifyReleaseNotesFailed,
  notifyReleaseNotesReady,
} from "../notifications/index.js";
import { getAuthStore } from "../../core/auth-store.js";

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
  /**
   * How this RepoOS was installed, and the command that actually upgrades it
   * (#1073). Both come from `upgradeInstruction` — the same detection
   * `repoos upgrade` uses — so the dialog never tells a package-manager or
   * source install to run a command that would not work for it.
   */
  installKind: InstallKind;
  upgradeCommand: string;
}

/**
 * The install detection shared by every `AvailableRelease` we return (#1073).
 *
 * The version passed here is the one in the *install's own* `.build-info.json`
 * (`readInstallVersion`), not `readBuildMeta().version` — the latter falls back
 * to `package.json`, so a bare source run and the CLI can otherwise disagree on
 * the same checkout (#1073 review). `upgradeInstruction` also probes the install
 * root structurally, so a built source checkout is never mistaken for a
 * standalone install.
 */
interface InstallInfo {
  installKind: InstallKind;
  upgradeCommand: string;
  /**
   * The channel the banner must compare against: set only for a standalone
   * channel install, the one case `repoos upgrade` follows a channel (see
   * `cmdUpgrade`). Null means the stable latest release.
   */
  channel: string | null;
}

function installInfo(): InstallInfo {
  const root = installRoot();
  const version = readInstallVersion(root);
  const channel = channelFromVersion(version);
  const instruction = upgradeInstruction({ installRoot: root, version, channel });
  return {
    installKind: instruction.installKind,
    upgradeCommand: instruction.command,
    channel: instruction.installKind === "standalone" ? channel : null,
  };
}

export { isNewerVersion, isStableRelease } from "../../core/release-version.js";

/**
 * The newest release `repoos upgrade` would install for this install: the
 * stable latest, or the newest build on the install's channel (the same
 * lookup `cmdUpgrade` uses, so the banner and the command agree).
 */
async function fetchAvailableRelease(
  install: InstallInfo,
  config: RepoOSConfig,
): Promise<AvailableRelease | null> {
  const currentVersion = readBuildMeta().version;
  if (isUpdateCheckEnvDisabled() || !isUpdateCheckConfigEnabled(config)) return null;
  try {
    const candidate = await fetchLatestRelease(install.channel, AbortSignal.timeout(5000));
    const mapped = availableReleaseFromGithub(install, candidate, currentVersion ?? "");
    return {
      currentVersion,
      latestVersion: mapped.latestVersion,
      available: mapped.available,
      releaseNotes:
        typeof candidate.body === "string" && candidate.body.trim() ? candidate.body : null,
      releaseUrl: mapped.releaseUrl,
      installKind: install.installKind,
      upgradeCommand: install.upgradeCommand,
    };
  } catch {
    return null;
  }
}

export const getAvailableRelease: RouteHandler = async (ctx, _req, res) => {
  if (!isUpdateCheckConfigEnabled(ctx.config)) {
    const install = installInfo();
    return json(res, 200, {
      currentVersion: readBuildMeta().version,
      latestVersion: null,
      available: false,
      releaseNotes: null,
      releaseUrl: "https://github.com/repo-os/repoos/releases",
      installKind: install.installKind,
      upgradeCommand: install.upgradeCommand,
    });
  }
  const now = Date.now();
  if (releaseCache && releaseCache.expiresAt > now) return json(res, 200, releaseCache.value);
  const install = installInfo();
  const fallback: AvailableRelease = {
    currentVersion: readBuildMeta().version,
    latestVersion: null,
    available: false,
    releaseNotes: null,
    releaseUrl: "https://github.com/repo-os/repoos/releases",
    installKind: install.installKind,
    upgradeCommand: install.upgradeCommand,
  };
  if (releaseFailureUntil > now) return json(res, 200, fallback);
  releaseRequest ??= fetchAvailableRelease(install, ctx.config).finally(() => {
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

// ---------------------------------------------------------------------------
// "When the AI draft is ready": notify me or publish automatically (#1126)
// ---------------------------------------------------------------------------

/** The context bits the detached auto-publish flow needs from a request. */
type NotesRunContext = Pick<RouteContext, "config" | "remoteValidator" | "emitEvent">;

type AutoPublishStarter = (ctx: NotesRunContext, record: ReleaseAutoPublishRecord) => void;

/**
 * Starts the guarded release cut. The default is the same `beginRelease` the
 * manual Publish button uses, so an automatic cut can never bypass a blocker,
 * a version/tag confirmation, the clean-main check or `repoos check`. Overridden
 * only by tests.
 */
let autoPublishStarter: AutoPublishStarter | null = null;

/** Test seam: substitute the release cut so tests never push/tag a fixture. */
export function __setReleaseAutoPublishStarterForTests(starter: AutoPublishStarter | null): void {
  autoPublishStarter = starter;
}

function releaseNotificationCtx(config: RepoOSConfig, origin: string | null) {
  return notificationContextFromConfig(config, getAuthStore(config.root), origin ?? undefined);
}

function stamp(): string {
  return new Date().toISOString();
}

function writeAutoPublishState(
  config: RepoOSConfig,
  requestedAt: string,
  patch: Partial<ReleaseAutoPublishRecord>,
): ReleaseAutoPublishRecord | null {
  const current = readReleaseAutoPublish(config);
  if (!current || current.requestedAt !== requestedAt) return null;
  const next: ReleaseAutoPublishRecord = { ...current, ...patch, updatedAt: stamp() };
  writeReleaseAutoPublish(config, next);
  return next;
}

/**
 * The durable pending choice: the release panel polls this alongside the draft
 * run, so a reload (or a second tab) sees the same promise the server owns.
 * `defaultWhenReady` is the remembered Settings answer for the modal.
 */
export const getReleaseAutoPublish: RouteHandler = (ctx, _req, res) =>
  json(res, 200, {
    autoPublish: readReleaseAutoPublish(ctx.config),
    defaultWhenReady: ctx.config.release?.notesWhenReady ?? "notify",
  });

/**
 * Cancel an automatic publish before it starts. A record already `publishing`
 * is too late (the cut is outward-facing and must not be torn down halfway);
 * a terminal record is dismissed by clearing it, which is how the page drops a
 * failure banner.
 */
export const cancelReleaseAutoPublish: RouteHandler = (ctx, _req, res) => {
  const current = readReleaseAutoPublish(ctx.config);
  if (!current) return json(res, 200, { autoPublish: null });
  if (current.state === "publishing") {
    return json(res, 409, {
      error: `${current.tag} is already being published and can no longer be cancelled.`,
      autoPublish: current,
    });
  }
  if (!isReleaseAutoPublishActive(current)) {
    writeReleaseAutoPublish(ctx.config, null);
    return json(res, 200, { autoPublish: null });
  }
  const next: ReleaseAutoPublishRecord = {
    ...current,
    state: "cancelled",
    updatedAt: stamp(),
  };
  writeReleaseAutoPublish(ctx.config, next);
  return json(res, 200, { autoPublish: next });
};

/**
 * Fail a still-active record and tell the human why, in-app and through the
 * configured channels. Never throws: a notification problem must not turn a
 * failed publish into a failed request.
 */
function failAutoPublish(
  ctx: NotesRunContext,
  requestedAt: string,
  reason: string,
  kind: "publish" | "notes" = "publish",
): void {
  const current = readReleaseAutoPublish(ctx.config);
  if (!current || current.requestedAt !== requestedAt) return;
  if (!isReleaseAutoPublishActive(current)) return;
  const next = writeAutoPublishState(ctx.config, requestedAt, {
    state: "failed",
    error: reason,
  });
  if (!next) return;
  if (kind === "notes") {
    notifyAttentionReleaseNotesFailed(next.tag, reason);
    notifyReleaseNotesFailed(releaseNotificationCtx(ctx.config, next.origin), {
      tag: next.tag,
      reason,
    });
    return;
  }
  notifyAttentionReleaseAutoPublishFailed(next.tag, reason);
  notifyReleaseAutoPublishFailed(releaseNotificationCtx(ctx.config, next.origin), {
    tag: next.tag,
    reason,
  });
}

/**
 * The draft landed. Record it on the pending choice, then either notify (the
 * human presses Publish) or run the guarded auto-publish. An empty draft is a
 * failure, never a silent no-op: the human asked for something to happen.
 */
function settleAutoPublishAfterDraft(
  ctx: NotesRunContext,
  notes: string,
  draftKey: string | null,
  head: string | null,
): Promise<void> {
  const current = readReleaseAutoPublish(ctx.config);
  if (!current) return Promise.resolve();
  if (!isReleaseAutoPublishActive(current)) return Promise.resolve(); // cancelled while drafting
  if (!notes.trim()) {
    failAutoPublish(
      ctx,
      current.requestedAt,
      "The AI draft came back empty, so nothing was published.",
      current.mode === "publish" ? "publish" : "notes",
    );
    return Promise.resolve();
  }
  const next = writeAutoPublishState(ctx.config, current.requestedAt, {
    state: current.mode === "publish" ? "ready" : "notified",
    notes,
    draftKey: draftKey ?? current.draftKey,
    head: head ?? current.head,
    error: null,
  });
  if (!next) return Promise.resolve();
  if (next.mode === "notify") {
    notifyReleaseNotesReady(releaseNotificationCtx(ctx.config, next.origin), { tag: next.tag });
    return Promise.resolve();
  }
  return maybeAutoPublish(ctx, next.requestedAt);
}

/**
 * Run every guard the manual Publish path runs *before* starting a cut, with a
 * reason the human can act on. Anything ambiguous fails closed: a stale draft
 * context, a dirty tree, an existing tag, a release already running.
 */
async function maybeAutoPublish(ctx: NotesRunContext, requestedAt: string): Promise<void> {
  const current = readReleaseAutoPublish(ctx.config);
  if (!current || current.requestedAt !== requestedAt || current.state !== "ready") return;
  const fail = (reason: string): void => failAutoPublish(ctx, requestedAt, reason, "publish");

  const notes = current.notes?.trim() ?? "";
  if (!notes) {
    fail("The AI draft came back empty, so nothing was published.");
    return;
  }
  if (!isReleaseVersion(current.version)) {
    fail(`"${current.version}" is not a semantic version, so nothing was published.`);
    return;
  }
  const status = await getReleaseStatus(ctx.config);
  if (!status.enabled || !status.supported) {
    fail("Releases are not configured for this repository, so nothing was published.");
    return;
  }
  if (!status.clean) {
    fail(
      "The working tree was dirty when the notes became ready, so nothing was published. Commit or stash the changes, then publish from the panel.",
    );
    return;
  }
  if (!status.onReleaseBranch) {
    fail(`This checkout was not on ${status.branch}, so nothing was published.`);
    return;
  }
  if (await releaseTagExists(ctx.config, current.tag)) {
    fail(`${current.tag} already exists, so nothing was published.`);
    return;
  }
  // The draft's identity is its release-relevant commit context. A bookkeeping
  // commit (task moves) leaves this key alone, so it cannot block a publish;
  // any source commit or a newly landed tag changes it and fails closed.
  const currentCommits = await collectReleaseCommits(ctx.config);
  const currentKey =
    currentCommits.head && currentCommits.relevantShas.length
      ? releaseNotesCacheKey(currentCommits.relevantShas, currentCommits.sinceTag)
      : null;
  if (current.draftKey !== currentKey) {
    fail(
      "New commits landed since the notes were drafted, so nothing was published. Generate notes again for the current tree.",
    );
    return;
  }
  if (run.state === "running") {
    fail("A release was already running, so nothing was published automatically.");
    return;
  }
  // Re-read after the awaits: Cancel may have landed while the checks ran.
  const fresh = readReleaseAutoPublish(ctx.config);
  if (!fresh || fresh.requestedAt !== requestedAt || fresh.state !== "ready") return;
  const publishing = writeAutoPublishState(ctx.config, requestedAt, { state: "publishing" });
  if (!publishing) return;
  (autoPublishStarter ?? startAutoReleaseCut)(ctx, publishing);
}

/**
 * Resume the promise after a process restart (#1126). The draft run itself is
 * in-memory, so a `waiting` record can only recover when its draft already
 * reached the on-disk cache; otherwise the choice fails closed and says so.
 * A `ready` record is safe to continue through the same guards. `publishing`
 * is never retried silently — a crash mid-cut may have pushed the bump or tag.
 */
export async function resumeReleaseAutoPublish(ctx: NotesRunContext): Promise<void> {
  const current = readReleaseAutoPublish(ctx.config);
  if (!current) return;
  if (current.state === "waiting") {
    const cached = current.draftKey
      ? readCachedReleaseNotes(ctx.config.root, ctx.config.cacheDir, current.draftKey)
      : null;
    if (cached?.notes.trim()) {
      await settleAutoPublishAfterDraft(ctx, cached.notes, current.draftKey, current.head);
      return;
    }
    failAutoPublish(
      ctx,
      current.requestedAt,
      "RepoOS restarted before the AI draft finished, so nothing was published. Generate notes again to retry.",
      current.mode === "publish" ? "publish" : "notes",
    );
    return;
  }
  if (current.state === "ready") {
    await maybeAutoPublish(ctx, current.requestedAt);
    return;
  }
  if (current.state === "publishing") {
    failAutoPublish(
      ctx,
      current.requestedAt,
      `RepoOS restarted while ${current.tag} was publishing and did not retry automatically. Check whether the tag exists, then publish manually if needed.`,
      "publish",
    );
  }
}

/** The auto-publish half of `beginRelease`: settle the pending record on the cut's outcome. */
function settleAutoPublishAfterCut(
  ctx: NotesRunContext,
  requestedAt: string | undefined,
  ok: boolean,
  output: string,
): void {
  if (!requestedAt) return;
  const current = readReleaseAutoPublish(ctx.config);
  if (!current || current.requestedAt !== requestedAt || current.state !== "publishing") return;
  if (ok) {
    writeAutoPublishState(ctx.config, requestedAt, { state: "succeeded", error: null });
    return;
  }
  const reason =
    output
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean) ?? "The release cut failed.";
  writeAutoPublishState(ctx.config, requestedAt, { state: "failed", error: reason });
  // The failed release run already has its own in-app item; the external
  // channels still need to hear that the promised automatic publish did not
  // happen.
  notifyReleaseAutoPublishFailed(releaseNotificationCtx(ctx.config, current.origin), {
    tag: current.tag,
    reason,
  });
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
      ...repoAgentRunTmpOpts(config),
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

/** In-memory release-notes draft run for the attention feed (#0687). */
export function getReleaseNotesRunState(): ReleaseNotesRun {
  return notesRun;
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
    knownIssues?: unknown;
  };
  if (typeof body.version !== "string" || typeof body.confirmTag !== "string")
    return json(res, 400, { error: "version and confirmTag are required" });
  if (run.state === "running")
    return json(res, 409, { error: "A release is already running", run });
  // A pending automatic publish owns the next cut for its exact version. The
  // manual button must not race it into two releases; Cancel clears it first.
  const pending = readReleaseAutoPublish(ctx.config);
  if (isReleaseAutoPublishActive(pending)) {
    return json(res, 409, {
      error: `An automatic publish for ${pending.tag} is pending. Cancel it first, or wait for it to finish.`,
      autoPublish: pending,
    });
  }
  const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes : undefined;
  const knownIssues =
    typeof body.knownIssues === "string" && body.knownIssues.trim() ? body.knownIssues : undefined;
  const started = beginRelease(ctx, body.version, body.confirmTag, notes, knownIssues);
  return json(res, 202, { ok: true, run: started });
};

/**
 * The one guarded release path, shared by the Publish button and an automatic
 * publish (#1126). `cutNewRelease` re-validates clean main, the configured
 * branch, the exact tag confirmation and the version before it commits or
 * pushes anything, so a caller cannot bypass a blocker by reaching this
 * function directly.
 */
function beginRelease(
  ctx: NotesRunContext,
  version: string,
  confirmTag: string,
  notes: string | undefined,
  knownIssues: string | undefined,
  opts: { autoPublishRequestedAt?: string } = {},
): ReleaseRun {
  run = {
    state: "running",
    phase: "preparing",
    message: "Starting release…",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  void cutNewRelease(
    ctx.config,
    version,
    confirmTag,
    undefined,
    (phase, message) => updateRun(phase, message),
    ctx.remoteValidator,
    notes,
    knownIssues,
  )
    // Keep the phase that was in flight when it failed, so the UI can say
    // "failed during checking" rather than a bare "failed".
    .then((result) => {
      settleAutoPublishAfterCut(ctx, opts.autoPublishRequestedAt, result.ok, result.output);
      if (result.ok) return updateRun(null, result.output, "succeeded");
      const startedAt = run.startedAt;
      const phase = run.phase;
      const failedTests = releaseFailedTests(ctx.config, startedAt, result.output);
      updateRun(phase, result.output, "failed", { failedTests, tldrPending: true });
      void writeReleaseTldr(ctx.config, startedAt, phase, result.output, failedTests);
    })
    .catch(() => {
      settleAutoPublishAfterCut(
        ctx,
        opts.autoPublishRequestedAt,
        false,
        "Release runner stopped unexpectedly.",
      );
      updateRun(
        null,
        "Release runner stopped unexpectedly. Check the repository state before retrying.",
        "failed",
      );
    });
  return run;
}

/** The default auto-publish starter: the same run the Publish button creates. */
function startAutoReleaseCut(ctx: NotesRunContext, record: ReleaseAutoPublishRecord): void {
  beginRelease(
    ctx,
    record.version,
    record.tag,
    record.notes?.trim() || undefined,
    record.knownIssues ?? undefined,
    { autoPublishRequestedAt: record.requestedAt },
  );
}

// ---------------------------------------------------------------------------
// Release emails (#1071)
// ---------------------------------------------------------------------------

function releaseEmailContext(config: RepoOSConfig): ReleaseEmailContext {
  return { upgradeCommand: expectsOwnCliRepo(config.root) ? "repoos upgrade" : undefined };
}

/** `?version=`, else the newest recorded release (the one a cut just made). */
function releaseEmailVersion(config: RepoOSConfig, req: IncomingMessage): string | null {
  const url = new URL(req.url ?? "/", "http://localhost");
  const requested = url.searchParams.get("version")?.trim();
  return requested || readReleaseHistory(config.root).releases[0]?.version || null;
}

/**
 * The email state the Releases page shows for one release, plus the options
 * the Settings page edits. Reads only local files: no network, no send.
 */
export const getReleaseEmail: RouteHandler = (ctx, req, res) => {
  const { config } = ctx;
  const email = config.release?.email ?? {};
  try {
    const version = releaseEmailVersion(config, req);
    return json(res, 200, {
      enabled: email.enabled === true,
      to: email.to ?? [],
      when: email.when ?? "published",
      includePrereleases: email.includePrereleases === true,
      providerConfigured: emailProviderConfigured(config),
      repository: githubRepository(config),
      version,
      record: version ? getReleaseEmailRecord(config, version) : null,
    });
  } catch (err) {
    return json(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
};

/** The rendered subject and bodies for a release, with no send (the Preview button). */
export const getReleaseEmailPreview: RouteHandler = (ctx, req, res) => {
  try {
    const version = releaseEmailVersion(ctx.config, req);
    if (!version) return json(res, 404, { error: "There is no release to preview yet." });
    return json(
      res,
      200,
      previewReleaseEmail(ctx.config, version, releaseEmailContext(ctx.config)),
    );
  } catch (err) {
    return json(res, 404, { error: err instanceof Error ? err.message : String(err) });
  }
};

/**
 * The explicit Resend button. Sends only to configured recipients who have not
 * received this release yet, so a retry never mails someone twice.
 */
export const sendReleaseEmailNow: RouteHandler = async (ctx, req, res) => {
  const body = (await readBody(req)) as { version?: unknown } | null;
  if (typeof body?.version !== "string" || !body.version.trim()) {
    return json(res, 400, { error: "version is required" });
  }
  try {
    const record = await resendReleaseEmail(ctx.config, body.version.trim(), {
      ...releaseEmailContext(ctx.config),
      publicOrigin: requestOrigin(req),
    });
    return json(res, 200, { ok: record.status === "sent", record });
  } catch (err) {
    return json(res, 409, { error: err instanceof Error ? err.message : String(err) });
  }
};

function requestOrigin(req: IncomingMessage): string {
  const host = req.headers?.host ?? "localhost";
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  return `${protocol}://${host}`;
}

/** Public one-click unsubscribe link; the random token identifies one address. */
export const unsubscribeReleaseEmailRoute: RouteHandler = (ctx, req, res) => {
  const token = new URL(req.url ?? "/", "http://localhost").searchParams.get("token") ?? "";
  const ok = unsubscribeReleaseEmail(ctx.config, token);
  res.writeHead(ok ? 200 : 404, { "Content-Type": "text/html; charset=utf-8" });
  res.end(
    ok
      ? "<p>Release emails have been turned off for this address.</p>"
      : "<p>This unsubscribe link is invalid or has already been used.</p>",
  );
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
  const { config } = ctx;
  const body = (await readBody(req)) as {
    version?: unknown;
    cachedOnly?: unknown;
    whenReady?: unknown;
    confirmTag?: unknown;
    knownIssues?: unknown;
  };
  const version = typeof body.version === "string" && body.version.trim() ? body.version : null;
  // Lookup only: the panel asks on open whether a saved draft already exists
  // for the current commits. A miss answers 200 with empty notes and never
  // starts an agent run (and needs no enabled agent to do so).
  const cachedOnly = body.cachedOnly === true;

  // #1126: "when the draft is ready" is a server-owned promise, because the
  // draft itself is a detached run. Validate it before touching run state so a
  // bad request can never leave a pending auto-publish behind.
  const whenReady: ReleaseWhenReady | null =
    body.whenReady === "publish" || body.whenReady === "notify" ? body.whenReady : null;
  if (body.whenReady !== undefined && whenReady === null) {
    return json(res, 400, { error: 'whenReady must be "publish" or "notify"' });
  }
  if (whenReady && cachedOnly) {
    return json(res, 400, { error: "whenReady cannot be combined with cachedOnly" });
  }
  const confirmTag =
    typeof body.confirmTag === "string" && body.confirmTag.trim() ? body.confirmTag.trim() : null;
  const knownIssues =
    typeof body.knownIssues === "string" && body.knownIssues.trim() ? body.knownIssues : null;

  if (whenReady) {
    const existing = readReleaseAutoPublish(config);
    if (isReleaseAutoPublishActive(existing)) {
      // A second click while the draft runs is the same promise, not a new
      // one — return it with the run so the panel can keep showing both.
      if (notesRun.state === "running") {
        return json(res, 202, { ok: true, run: notesRun, autoPublish: existing });
      }
      return json(res, 409, {
        error: `An automatic publish for ${existing.tag} is already pending. Cancel it before starting another.`,
        autoPublish: existing,
      });
    }
    if (!version && whenReady === "publish") {
      return json(res, 400, {
        error: "A version is required when choosing to publish automatically.",
      });
    }
    if (version && !isReleaseVersion(version)) {
      return json(res, 400, { error: `"${version}" is not a semantic version` });
    }
    const prefix = config.release?.tagPrefix ?? "v";
    const tag = version ? `${prefix}${version}` : "";
    // Auto-publish is tied to the exact version/tag the human confirmed. The
    // notification choice has no outward action, so it only records the tag
    // for its message (empty when the repo has no suggested version).
    if (whenReady === "publish" && confirmTag !== tag) {
      return json(res, 400, { error: `confirmTag must be ${tag}` });
    }
    const at = stamp();
    const pending: ReleaseAutoPublishRecord = {
      requestedAt: at,
      state: "waiting",
      mode: whenReady,
      version: version ?? "",
      tag,
      notes: null,
      knownIssues,
      // Attach to a draft already in flight so its result can settle this
      // promise; otherwise the run started below fills these in.
      head: notesRun.state === "running" ? notesRun.head : null,
      draftKey: notesRun.state === "running" ? notesRun.key : null,
      error: null,
      origin: requestOrigin(req),
      updatedAt: at,
    };
    writeReleaseAutoPublish(config, pending);
    if (notesRun.state === "running") {
      return json(res, 202, { ok: true, run: notesRun, autoPublish: pending });
    }
  }

  // A second click while a draft is being generated must return the run
  // already in flight, not spawn a second agent (#0605). Any POST that
  // arrives after the run started gets the same 202 back; the modal's own
  // drafting flag guards the double-click window before the run state
  // exists (the release run dedup has the same shape).
  if (notesRun.state === "running") {
    return json(res, 202, {
      ok: true,
      run: notesRun,
      autoPublish: readReleaseAutoPublish(config),
    });
  }

  const agent = releaseNotesAgent(config);
  if (!agent && !cachedOnly) {
    const pending = readReleaseAutoPublish(config);
    if (isReleaseAutoPublishActive(pending)) {
      failAutoPublish(
        ctx,
        pending.requestedAt,
        "No agent is enabled to draft release notes, so nothing was published.",
        pending.mode === "publish" ? "publish" : "notes",
      );
    }
    return json(res, 400, {
      error: "No agent is enabled to draft release notes — enable the PM or Engineer agent.",
    });
  }

  const { commits, sinceTag, truncated, head, relevantShas } = await collectReleaseCommits(config);
  if (!relevantShas.length) {
    // Nothing release-relevant to summarize is not an error for a plain draft:
    // the cut can still proceed. A chosen publish/notify promise cannot be
    // kept, though, so it fails closed with a reason.
    const pending = readReleaseAutoPublish(config);
    if (isReleaseAutoPublishActive(pending)) {
      failAutoPublish(
        ctx,
        pending.requestedAt,
        sinceTag
          ? `There are no release-relevant commits since ${sinceTag}, so nothing was published.`
          : "There are no release-relevant commits to draft from, so nothing was published.",
        pending.mode === "publish" ? "publish" : "notes",
      );
    }
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
      // A cached draft is still a finished draft: keep the promise the human
      // made in the panel without spending another agent run.
      const pending = readReleaseAutoPublish(config);
      if (isReleaseAutoPublishActive(pending)) {
        await settleAutoPublishAfterDraft(ctx, cached.notes, cacheKey, head);
      }
      return json(res, 200, {
        notes: cached.notes,
        sinceTag,
        commitCount: relevantShas.length,
        truncated,
        cached: true,
        cachedAt: cached.createdAt || null,
        autoPublish: readReleaseAutoPublish(config),
      });
    }
  }

  if (cachedOnly || !agent) {
    return json(res, 200, { notes: "", sinceTag, commitCount: relevantShas.length, truncated });
  }

  // The run is about to start, so a waiting promise can now bind to its exact
  // context (and survive a restart through the draft cache).
  const waiting = readReleaseAutoPublish(config);
  if (isReleaseAutoPublishActive(waiting)) {
    writeAutoPublishState(config, waiting.requestedAt, {
      head,
      draftKey: cacheKey,
      updatedAt: stamp(),
    });
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
  ctx.emitEvent({ type: "release.notesRun", state: "running", at: startedAt });
  notesRunInFlight = draftNotes(ctx, agent, prompt, { cacheKey, head, sinceTag })
    .catch(() => {
      // draftNotes never rejects — this guards the seam only, so an unexpected
      // throw cannot surface as an unhandled rejection alongside the failed
      // run state the UI reads.
    })
    .finally(() => {
      notesRunInFlight = null;
    });
  return json(res, 202, {
    ok: true,
    run: notesRun,
    autoPublish: readReleaseAutoPublish(config),
  });
};

/**
 * The detached half of `generateReleaseNotes`: run the agent, record the
 * usage (house rule — every one-shot call lands in `sessions`), cache the
 * draft when it succeeded and the commit context was keyable, and move the
 * tracked run state to `succeeded`/`failed`.
 */
async function draftNotes(
  ctx: NotesRunContext,
  agent: Agent,
  prompt: string,
  meta: { cacheKey: string | null; head: string | null; sinceTag: string | null },
): Promise<void> {
  const { config } = ctx;
  const fail = (error: string): void => {
    notesRun = { ...notesRun, state: "failed", error, notes: null, updatedAt: stamp() };
    ctx.emitEvent({ type: "release.notesRun", state: "failed", error, at: notesRun.updatedAt! });
    const pending = readReleaseAutoPublish(config);
    if (isReleaseAutoPublishActive(pending)) {
      failAutoPublish(
        ctx,
        pending.requestedAt,
        error,
        pending.mode === "publish" ? "publish" : "notes",
      );
    }
    notifyAttentionReleaseNotesTerminal();
  };
  try {
    const result = await runPrompt(agent, prompt, {
      cwd: config.root,
      ...repoAgentRunTmpOpts(config),
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
    ctx.emitEvent({ type: "release.notesRun", state: "succeeded", at: notesRun.updatedAt! });
    // Settle the panel's "when ready" promise after the run state and cache are
    // durable: a notify lands on a filled-in panel, an auto-publish starts the
    // guarded cut, and a cancelled record is simply ignored.
    await settleAutoPublishAfterDraft(ctx, notes, meta.cacheKey, meta.head);
    notifyAttentionReleaseNotesTerminal();
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}
