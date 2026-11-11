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
/** Mirror `RELEASE_FAILURE_CACHE_MS` in `src/server/routes/release.ts`. */
export const UPDATE_CHECK_FAILURE_CACHE_MS = 60 * 1000;
export const UPDATE_CHECK_TIMEOUT_MS = 1500;
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
  const ttl = cache.fetchSucceeded === false ? UPDATE_CHECK_FAILURE_CACHE_MS : UPDATE_CHECK_TTL_MS;
  return now - cache.lastCheckedAt >= ttl;
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
    const cache: UpdateCheckCache = {
      lastCheckedAt: now(),
      latestVersion: result.latestVersion,
      url: result.releaseUrl,
      channel: channelKey,
      fetchSucceeded: true,
      dismissedVersion: prev?.dismissedVersion ?? null,
      lastNoticeAt: prev?.lastNoticeAt,
    };
    writeUpdateCheckCache(path, cache);
    return cache;
  } catch {
    const keepPrior = prev && cacheMatchesInstallChannel(prev, install.channel) ? prev : null;
    const cache: UpdateCheckCache = {
      lastCheckedAt: now(),
      latestVersion: keepPrior?.latestVersion ?? null,
      url: keepPrior?.url ?? null,
      channel: channelKey,
      fetchSucceeded: false,
      dismissedVersion: keepPrior?.dismissedVersion ?? null,
      lastNoticeAt: keepPrior?.lastNoticeAt,
    };
    writeUpdateCheckCache(path, cache);
    return cache;
  }
}

function spawnDetachedUpdateCheckRefresh(): void {
  if (process.env[REPOOS_UPDATE_CHECK_CHILD] === "1") return;
  const entry = process.argv[1];
  if (!entry) return;
  const child = spawn(process.execPath, [entry, CLI_UPDATE_CHECK_REFRESH_CMD], {
    stdio: "ignore",
    detached: true,
    env: { ...process.env, [REPOOS_UPDATE_CHECK_CHILD]: "1" },
  });
  child.unref();
}

/**
 * Start a detached background refresh when the on-disk cache is stale. The parent
 * process never holds an in-flight GitHub GET open (so exit is not delayed).
 */
export function prefetchCliUpdateCheck(deps: UpdateCheckDeps = {}): void {
  const home = deps.home ?? homedir;
  const path = updateCheckCachePath(home());
  const now = (deps.now ?? Date.now)();
  const root = (deps.installRoot ?? installRoot)();
  const installVersion = (deps.readInstallVersion ?? readInstallVersion)(root);
  const install = releaseFromInstall(root, installVersion);
  if (install.installKind === "source") return;

  const cached = readUpdateCheckCache(path);
  if (!shouldRefreshUpdateCheckCache(cached, install.channel, now)) return;

  if (deps.spawnDetachedRefresh) {
    deps.spawnDetachedRefresh();
    return;
  }
  spawnDetachedUpdateCheckRefresh();
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
    writeUpdateCheckCache(path, {
      ...cache,
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
  if (!shouldRunCliUpdateCheck(input)) return;
  prefetchCliUpdateCheck(input.deps);
}

export function registerCliUpdateNoticeExitHook(input: CliUpdateHookInput): void {
  if (!shouldRunCliUpdateCheck(input)) return;
  process.once("exit", () => emitCliUpdateNoticeOnExit(input.deps));
}

/** Run the detached refresh child to completion (used from `src/cli/index.ts`). */
export async function runCliUpdateCheckRefreshChild(deps: UpdateCheckDeps = {}): Promise<void> {
  const path = updateCheckCachePath((deps.home ?? homedir)());
  let signal: AbortSignal;
  try {
    signal = AbortSignal.timeout(UPDATE_CHECK_TIMEOUT_MS);
  } catch {
    signal = new AbortController().signal;
  }
  await refreshUpdateCheckCache(path, { ...deps, abortSignal: signal });
}
