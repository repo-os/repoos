/**
 * Passive RepoOS release update check — shared by the CLI stderr notice and
 * the server's `/api/release/available` route. One anonymous GET to GitHub; see
 * `docs/update-check.md`.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig } from "./types.js";
import { machineStateDir } from "./install-layout.js";
import { isNewerVersion, isStableRelease } from "./release-version.js";
import {
  channelFromVersion,
  fetchLatestRelease,
  installRoot,
  readInstallVersion,
  type InstallKind,
  type Release,
  upgradeInstruction,
} from "../commands/upgrade.js";
import { readVersion } from "./version.js";

export const UPDATE_CHECK_CACHE_FILE = "release-update-cache.json";
export const UPDATE_CHECK_TTL_MS = 24 * 60 * 60 * 1000;
/**
 * Short retry after a generic failure (offline, DNS, timeout, 5xx). Mirrors
 * `RELEASE_FAILURE_CACHE_MS` in `src/server/routes/release.ts` so a transient
 * blip is retried soon.
 */
export const UPDATE_CHECK_FAILURE_CACHE_MS = 60 * 1000;
/**
 * Long backoff after a rate-limit response (403/429). Unauthenticated GitHub
 * allows 60 requests/hour per IP; retrying every 60s would keep the quota
 * exhausted, so back off for a full day (the same 24h the spec asks for). A
 * `Retry-After` value, when GitHub sends one, is honoured instead (see
 * `updateCheckFailureBackoffMs`).
 */
export const UPDATE_CHECK_RATE_LIMIT_CACHE_MS = UPDATE_CHECK_TTL_MS;
export const UPDATE_CHECK_TIMEOUT_MS = 1500;
/**
 * How long a `refreshingSince` marker suppresses further spawns. Covers the
 * refresh timeout plus child startup, and bounds the damage of a stale marker
 * left by a killed child (after this window a new spawn is allowed again).
 */
export const UPDATE_CHECK_SPAWN_LOCK_MS = 60 * 1000;
/** Internal argv[1] for a detached cache refresh (not user-facing). */
export const CLI_UPDATE_CHECK_REFRESH_CMD = "__update-check-refresh";
export const REPOOS_UPDATE_CHECK_CHILD = "REPOOS_UPDATE_CHECK_CHILD";
const DEFAULT_RELEASE_URL = "https://github.com/repo-os/repoos/releases";

export interface UpdateCheckCache {
  lastCheckedAt: number;
  latestVersion: string | null;
  url: string | null;
  dismissedVersion: string | null;
  /** Install channel this row was fetched for (`""` = stable latest). */
  channel?: string;
  /** False when the last refresh failed (shorter refetch TTL). */
  fetchSucceeded?: boolean;
  /**
   * Unix ms before which a failed refresh must not be retried. Set on a
   * rate-limit response to honour `Retry-After` or the 24h fallback; absent
   * for generic failures, which use `UPDATE_CHECK_FAILURE_CACHE_MS`.
   */
  retryNotBefore?: number;
  /**
   * Unix ms when a detached refresh was last spawned. Suppresses parallel
   * spawns (several `repoos` commands at once, or offline runs) until the
   * child finishes or `UPDATE_CHECK_SPAWN_LOCK_MS` elapses. Cleared on write.
   */
  refreshingSince?: number;
  /** When the CLI last printed its stderr notice (throttle within TTL). */
  lastNoticeAt?: number;
}

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string | null;
  available: boolean;
  releaseUrl: string;
  upgradeCommand: string;
  installKind: InstallKind;
}

export interface UpdateCheckDeps {
  now?: () => number;
  home?: () => string;
  fetchRelease?: (channel: string | null, signal?: AbortSignal) => Promise<Release>;
  installRoot?: () => string;
  readInstallVersion?: (root: string) => string | null;
  readVersion?: () => string;
  env?: NodeJS.ProcessEnv;
  /** When set, combined with the usual timeout for in-flight CLI refresh. */
  abortSignal?: AbortSignal;
  /** Test hook — run refresh in-process instead of a detached child. */
  spawnDetachedRefresh?: () => void;
}

export function updateCheckChannelKey(channel: string | null): string {
  return channel ?? "";
}

export function updateCheckCachePath(home = homedir()): string {
  return join(machineStateDir(home), UPDATE_CHECK_CACHE_FILE);
}

export function readUpdateCheckCache(
  path: string,
  read: (p: string) => string = (p) => readFileSync(p, "utf8"),
): UpdateCheckCache | null {
  try {
    if (!existsSync(path)) return null;
    const raw = JSON.parse(read(path)) as UpdateCheckCache;
    if (typeof raw.lastCheckedAt !== "number") return null;
    return {
      lastCheckedAt: raw.lastCheckedAt,
      latestVersion: typeof raw.latestVersion === "string" ? raw.latestVersion : null,
      url: typeof raw.url === "string" ? raw.url : null,
      dismissedVersion: typeof raw.dismissedVersion === "string" ? raw.dismissedVersion : null,
      channel: typeof raw.channel === "string" ? raw.channel : undefined,
      fetchSucceeded: raw.fetchSucceeded === false ? false : true,
      retryNotBefore: typeof raw.retryNotBefore === "number" ? raw.retryNotBefore : undefined,
      refreshingSince: typeof raw.refreshingSince === "number" ? raw.refreshingSince : undefined,
      lastNoticeAt: typeof raw.lastNoticeAt === "number" ? raw.lastNoticeAt : undefined,
    };
  } catch {
    return null;
  }
}

export function writeUpdateCheckCache(path: string, cache: UpdateCheckCache): void {
  try {
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, JSON.stringify(cache, null, 2) + "\n", "utf8");
  } catch {
    /* cache is best-effort */
  }
}

export function cacheMatchesInstallChannel(
  cache: UpdateCheckCache,
  channel: string | null,
): boolean {
  if (cache.channel === undefined) return false;
  return cache.channel === updateCheckChannelKey(channel);
}

export function shouldRefreshUpdateCheckCache(
  cache: UpdateCheckCache | null,
  channel: string | null,
  now: number,
): boolean {
  if (!cache || !cacheMatchesInstallChannel(cache, channel)) return true;
  if (cache.fetchSucceeded === false) {
    const ttl =
      typeof cache.retryNotBefore === "number"
        ? Math.max(0, cache.retryNotBefore - cache.lastCheckedAt)
        : UPDATE_CHECK_FAILURE_CACHE_MS;
    return now - cache.lastCheckedAt >= ttl;
  }
  return now - cache.lastCheckedAt >= UPDATE_CHECK_TTL_MS;
}

/**
 * Whether a detached refresh may be spawned now. False while a recent spawn is
 * still in flight (`refreshingSince` within `UPDATE_CHECK_SPAWN_LOCK_MS`), so
 * parallel commands and offline retries don't fork a child per invocation.
 */
export function shouldSpawnUpdateCheckRefresh(
  cache: UpdateCheckCache | null,
  now: number,
): boolean {
  if (!cache || typeof cache.refreshingSince !== "number") return true;
  return now - cache.refreshingSince >= UPDATE_CHECK_SPAWN_LOCK_MS;
}

/**
 * A failed release lookup that carries the HTTP status (and optional
 * `Retry-After`) so the cache can pick the right backoff. `fetchLatestRelease`
 * throws a plain `Error`; `updateCheckFailureFromError` recovers the status from
 * either a typed error or its message.
 */
export interface UpdateCheckFetchFailure {
  status: number | null;
  retryAfterMs: number | null;
}

export class UpdateCheckFetchError extends Error {
  readonly status: number;
  readonly retryAfterMs: number | null;

  constructor(status: number, retryAfterMs: number | null = null) {
    super(`GitHub API returned ${status}`);
    this.name = "UpdateCheckFetchError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export function isRateLimitStatus(status: number | null): boolean {
  return status === 403 || status === 429;
}

/** Classify a thrown lookup error. Never throws. */
export function updateCheckFailureFromError(err: unknown): UpdateCheckFetchFailure {
  if (err instanceof UpdateCheckFetchError) {
    return { status: err.status, retryAfterMs: err.retryAfterMs };
  }
  const status =
    typeof (err as { status?: unknown })?.status === "number"
      ? ((err as { status: number }).status as number)
      : null;
  const retryAfterMs =
    typeof (err as { retryAfterMs?: unknown })?.retryAfterMs === "number"
      ? ((err as { retryAfterMs: number }).retryAfterMs as number)
      : null;
  if (status !== null) return { status, retryAfterMs };
  const match = /returned (\d{3})/.exec(err instanceof Error ? err.message : "");
  return { status: match ? Number(match[1]) : null, retryAfterMs };
}

/**
 * Backoff for a failed refresh, in ms. Generic failures stay at the short
 * mirror of the server's failure cache; a rate-limit response honours
 * `Retry-After` when given, else backs off for a full day.
 */
export function updateCheckFailureBackoffMs(failure: UpdateCheckFetchFailure): number {
  if (!isRateLimitStatus(failure.status)) return UPDATE_CHECK_FAILURE_CACHE_MS;
  if (typeof failure.retryAfterMs === "number" && failure.retryAfterMs > 0) {
    return failure.retryAfterMs;
  }
  return UPDATE_CHECK_RATE_LIMIT_CACHE_MS;
}

/**
 * Fields the detached refresh child owns. Everything else (`lastNoticeAt` the
 * parent writes on exit, `dismissedVersion` the dashboard owns) is merged from
 * the file as it is at write time, so a concurrent parent write is not lost.
 */
function mergeUpdateCheckCache(
  path: string,
  owned: Pick<
    UpdateCheckCache,
    | "lastCheckedAt"
    | "latestVersion"
    | "url"
    | "channel"
    | "fetchSucceeded"
    | "retryNotBefore"
    | "refreshingSince"
  >,
): UpdateCheckCache {
  const current = readUpdateCheckCache(path);
  const merged: UpdateCheckCache = {
    ...owned,
    dismissedVersion: current?.dismissedVersion ?? null,
    lastNoticeAt: current?.lastNoticeAt,
  };
  writeUpdateCheckCache(path, merged);
  return merged;
}

/** Stamp the in-flight spawn marker, preserving the rest of the row. */
function markRefreshSpawned(path: string, now: number): void {
  const current = readUpdateCheckCache(path);
  if (!current) return;
  writeUpdateCheckCache(path, { ...current, refreshingSince: now });
}

export function isUpdateCheckEnvDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.REPOOS_NO_UPDATE_CHECK === "1" || env.REPOOS_DISABLE_UPDATE_CHECK === "1";
}

export function isUpdateCheckConfigEnabled(config?: Pick<RepoOSConfig, "updates">): boolean {
  return config?.updates?.check !== false;
}

export function isCiEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CI === "true" || env.CI === "1" || !!env.GITHUB_ACTIONS || !!env.GITLAB_CI;
}

/** Commands whose output must stay script-clean or that manage upgrades themselves. */
const CLI_UPDATE_SKIP_COMMANDS = new Set([
  "help",
  "--help",
  "-h",
  "version",
  "--version",
  "-v",
  "upgrade",
  "serve",
  "server",
  "api",
]);

/**
 * Whether a one-shot `repoos` invocation should run the passive update check.
 * Long-running `serve` is excluded; machine-readable output is excluded.
 */
export function shouldRunCliUpdateCheck(input: {
  cmd: string | undefined;
  argv: string[];
  env?: NodeJS.ProcessEnv;
  config?: Pick<RepoOSConfig, "updates">;
  stderrIsTTY?: boolean;
  stdoutIsTTY?: boolean;
}): boolean {
  const env = input.env ?? process.env;
  if (isUpdateCheckEnvDisabled(env)) return false;
  if (!isUpdateCheckConfigEnabled(input.config)) return false;
  if (isCiEnvironment(env)) return false;
  if (!input.cmd || CLI_UPDATE_SKIP_COMMANDS.has(input.cmd)) return false;
  if (input.argv.includes("--json") || process.argv.includes("--json")) return false;
  const stderrTTY = input.stderrIsTTY ?? process.stderr.isTTY;
  const stdoutTTY = input.stdoutIsTTY ?? process.stdout.isTTY;
  if (!stderrTTY || !stdoutTTY) return false;
  return true;
}

export function releaseFromInstall(
  root: string,
  version: string | null,
  channelOverride?: string | null,
): { installKind: InstallKind; upgradeCommand: string; channel: string | null } {
  const channel = channelOverride ?? channelFromVersion(version);
  const instruction = upgradeInstruction({ installRoot: root, version, channel });
  return {
    installKind: instruction.installKind,
    upgradeCommand: instruction.command,
    channel: instruction.installKind === "standalone" ? channel : null,
  };
}

export function availableReleaseFromGithub(
  install: ReturnType<typeof releaseFromInstall>,
  candidate: Release,
  currentVersion: string,
): UpdateCheckResult {
  const tag = typeof candidate.tag_name === "string" ? candidate.tag_name : "";
  const onChannel = install.channel
    ? tag.includes(`-${install.channel}.`)
    : isStableRelease(candidate);
  const latestVersion = onChannel && tag ? tag.replace(/^v/, "") : null;
  const releaseUrl =
    typeof candidate.html_url === "string" && candidate.html_url.trim()
      ? candidate.html_url
      : DEFAULT_RELEASE_URL;
  return {
    currentVersion,
    latestVersion,
    available: isNewerVersion(latestVersion ?? "", currentVersion),
    releaseUrl,
    upgradeCommand: install.upgradeCommand,
    installKind: install.installKind,
  };
}

/** Exported for tests — refresh cache when stale. Never throws. */
export async function refreshUpdateCheckCache(
  path: string,
  deps: UpdateCheckDeps = {},
): Promise<UpdateCheckCache | null> {
  try {
    const now = deps.now ?? Date.now;
    const root = (deps.installRoot ?? installRoot)();
    const installVersion = (deps.readInstallVersion ?? readInstallVersion)(root);
    const install = releaseFromInstall(root, installVersion);
    if (install.installKind === "source") return null;

    const channelKey = updateCheckChannelKey(install.channel);
    const currentVersion = (deps.readVersion ?? readVersion)();
    const fetchRelease = deps.fetchRelease ?? fetchLatestRelease;
    const prev = readUpdateCheckCache(path);
    const signal = deps.abortSignal ?? AbortSignal.timeout(UPDATE_CHECK_TIMEOUT_MS);
    try {
      const candidate = await fetchRelease(install.channel, signal);
      const result = availableReleaseFromGithub(install, candidate, currentVersion);
      // Merge only the fields this refresh owns: `lastNoticeAt` (the parent's exit
      // hook) and `dismissedVersion` (the dashboard) are read from the file as it
      // is now, so a write that landed while our GET was in flight is not lost.
      return mergeUpdateCheckCache(path, {
        lastCheckedAt: now(),
        latestVersion: result.latestVersion,
        url: result.releaseUrl,
        channel: channelKey,
        fetchSucceeded: true,
        refreshingSince: undefined,
      });
    } catch (err) {
      const keepPrior = prev && cacheMatchesInstallChannel(prev, install.channel) ? prev : null;
      const failure = updateCheckFailureFromError(err);
      const backoffMs = updateCheckFailureBackoffMs(failure);
      return mergeUpdateCheckCache(path, {
        lastCheckedAt: now(),
        latestVersion: keepPrior?.latestVersion ?? null,
        url: keepPrior?.url ?? null,
        channel: channelKey,
        fetchSucceeded: false,
        retryNotBefore: backoffMs > 0 ? now() + backoffMs : undefined,
        refreshingSince: undefined,
      });
    }
  } catch {
    // "Never throws": even install detection / version reads can fail in a
    // broken install, and the refresh is passive.
    return null;
  }
}

function spawnDetachedUpdateCheckRefresh(): void {
  if (process.env[REPOOS_UPDATE_CHECK_CHILD] === "1") return;
  const entry = process.argv[1];
  if (!entry) return;
  try {
    const child = spawn(process.execPath, [entry, CLI_UPDATE_CHECK_REFRESH_CMD], {
      stdio: "ignore",
      detached: true,
      env: { ...process.env, [REPOOS_UPDATE_CHECK_CHILD]: "1" },
    });
    // A failed spawn (ENOENT/EACCES/…) emits an async `error` event; without a
    // listener Node turns it into an unhandled error that crashes the user's
    // command. Swallow both the async event and a synchronous throw: the
    // refresh is best-effort and must never break anything.
    child.on("error", () => {});
    child.unref();
  } catch {
    /* best-effort background refresh */
  }
}

/**
 * Start a detached background refresh when the on-disk cache is stale. The parent
 * process never holds an in-flight GitHub GET open (so exit is not delayed).
 */
export function prefetchCliUpdateCheck(deps: UpdateCheckDeps = {}): void {
  // Passive background work: any failure (unreadable state dir, home resolution,
  // a spawn throw) must never break the user's command. `emitCliUpdateNoticeOnExit`
  // already wraps itself; this path did not (review pass 2).
  try {
    const home = deps.home ?? homedir;
    const path = updateCheckCachePath(home());
    const now = (deps.now ?? Date.now)();
    const root = (deps.installRoot ?? installRoot)();
    const installVersion = (deps.readInstallVersion ?? readInstallVersion)(root);
    const install = releaseFromInstall(root, installVersion);
    if (install.installKind === "source") return;

    const cached = readUpdateCheckCache(path);
    if (!shouldRefreshUpdateCheckCache(cached, install.channel, now)) return;
    // Don't fork a child per command while one is already in flight; parallel
    // commands and offline retries would otherwise each spawn a full CLI.
    if (!shouldSpawnUpdateCheckRefresh(cached, now)) return;

    // Mark a spawn in flight before forking so a concurrent command backs off.
    // The child clears it when it writes; a killed child leaves it for at most
    // UPDATE_CHECK_SPAWN_LOCK_MS.
    markRefreshSpawned(path, now);
    if (deps.spawnDetachedRefresh) {
      deps.spawnDetachedRefresh();
      return;
    }
    spawnDetachedUpdateCheckRefresh();
  } catch {
    /* passive refresh is best-effort */
  }
}

export function formatCliUpdateNotice(result: UpdateCheckResult): string {
  const latest = result.latestVersion ?? "?";
  return (
    `A new RepoOS release is available: v${latest} (you have v${result.currentVersion}). ` +
    `Run: ${result.upgradeCommand}   (release notes: ${result.releaseUrl})`
  );
}

function noticeAllowed(cache: UpdateCheckCache, available: boolean, now: number): boolean {
  if (!available) return false;
  if (!cache.lastNoticeAt) return true;
  return now - cache.lastNoticeAt >= UPDATE_CHECK_TTL_MS;
}

/**
 * Synchronous exit hook: reads only the on-disk cache (no network). Never throws.
 */
export function emitCliUpdateNoticeOnExit(deps: UpdateCheckDeps = {}): void {
  try {
    const now = deps.now ?? Date.now;
    const home = deps.home ?? homedir;
    const path = updateCheckCachePath(home());

    const cache = readUpdateCheckCache(path);
    if (!cache) return;

    const root = (deps.installRoot ?? installRoot)();
    const installVersion = (deps.readInstallVersion ?? readInstallVersion)(root);
    const install = releaseFromInstall(root, installVersion);
    if (install.installKind === "source") return;
    if (!cacheMatchesInstallChannel(cache, install.channel)) return;

    const currentVersion = (deps.readVersion ?? readVersion)();
    const latestVersion = cache.latestVersion;
    const available = isNewerVersion(latestVersion ?? "", currentVersion);
    if (!noticeAllowed(cache, available, now())) return;

    const releaseUrl = cache.url ?? DEFAULT_RELEASE_URL;
    const line = formatCliUpdateNotice({
      currentVersion,
      latestVersion,
      available: true,
      releaseUrl,
      upgradeCommand: install.upgradeCommand,
      installKind: install.installKind,
    });
    process.stderr.write(line + "\n");
    // Re-read so a refresh child that wrote while we were shutting down isn't
    // clobbered; the exit hook owns only `lastNoticeAt`.
    const fresh = readUpdateCheckCache(path) ?? cache;
    writeUpdateCheckCache(path, {
      ...fresh,
      lastNoticeAt: now(),
    });
  } catch {
    /* silent */
  }
}

type CliUpdateHookInput = Parameters<typeof shouldRunCliUpdateCheck>[0] & {
  deps?: UpdateCheckDeps;
};

export function beginCliUpdateBackgroundRefresh(input: CliUpdateHookInput): void {
  // Never let the passive hook fail the command: `shouldRunCliUpdateCheck` and
  // the prefetch both touch env, config and the state dir.
  try {
    if (!shouldRunCliUpdateCheck(input)) return;
    prefetchCliUpdateCheck(input.deps);
  } catch {
    /* passive refresh is best-effort */
  }
}

export function registerCliUpdateNoticeExitHook(input: CliUpdateHookInput): void {
  try {
    if (!shouldRunCliUpdateCheck(input)) return;
    // `emitCliUpdateNoticeOnExit` wraps itself too; the guard here covers
    // `shouldRunCliUpdateCheck` and a throw from `process.once`.
    process.once("exit", () => emitCliUpdateNoticeOnExit(input.deps));
  } catch {
    /* passive notice is best-effort */
  }
}

/** Run the detached refresh child to completion (used from `src/cli/index.ts`). */
export async function runCliUpdateCheckRefreshChild(deps: UpdateCheckDeps = {}): Promise<void> {
  try {
    const path = updateCheckCachePath((deps.home ?? homedir)());
    let signal: AbortSignal;
    try {
      signal = AbortSignal.timeout(UPDATE_CHECK_TIMEOUT_MS);
    } catch {
      signal = new AbortController().signal;
    }
    await refreshUpdateCheckCache(path, { ...deps, abortSignal: signal });
  } catch {
    /* the child is best-effort; it must exit 0 regardless */
  }
}
