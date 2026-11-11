/**
 * Passive RepoOS release update check — shared by the CLI stderr notice and
 * the server's `/api/release/available` route. One anonymous GET to GitHub; see
 * `docs/update-check.md`.
 */
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
export const UPDATE_CHECK_TIMEOUT_MS = 1500;
const DEFAULT_RELEASE_URL = "https://github.com/repo-os/repoos/releases";

export interface UpdateCheckCache {
  lastCheckedAt: number;
  latestVersion: string | null;
  url: string | null;
  dismissedVersion: string | null;
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
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
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
      dismissedVersion:
        typeof raw.dismissedVersion === "string" ? raw.dismissedVersion : null,
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

export function isUpdateCheckEnvDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    env.REPOOS_NO_UPDATE_CHECK === "1" ||
    env.REPOOS_DISABLE_UPDATE_CHECK === "1"
  );
}

export function isUpdateCheckConfigEnabled(config?: Pick<RepoOSConfig, "updates">): boolean {
  return config?.updates?.check !== false;
}

export function isCiEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CI === "true" || env.CI === "1" || !!env.GITHUB_ACTIONS || !!env.GITLAB_CI;
}

/** Commands that never get the passive CLI notice. */
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
}): boolean {
  const env = input.env ?? process.env;
  if (isUpdateCheckEnvDisabled(env)) return false;
  if (!isUpdateCheckConfigEnabled(input.config)) return false;
  if (isCiEnvironment(env)) return false;
  if (!input.cmd || CLI_UPDATE_SKIP_COMMANDS.has(input.cmd)) return false;
  if (input.argv.includes("--json") || process.argv.includes("--json")) return false;
  if (!process.stderr.isTTY || !process.stdout.isTTY) return false;
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

async function refreshUpdateCheckCache(
  path: string,
  deps: UpdateCheckDeps = {},
): Promise<UpdateCheckCache | null> {
  const now = deps.now ?? Date.now;
  const root = (deps.installRoot ?? installRoot)();
  const installVersion = (deps.readInstallVersion ?? readInstallVersion)(root);
  const install = releaseFromInstall(root, installVersion);
  if (install.installKind === "source") return null;

  const currentVersion = (deps.readVersion ?? readVersion)();
  const fetchRelease = deps.fetchRelease ?? fetchLatestRelease;
  try {
    const candidate = await fetchRelease(
      install.channel,
      AbortSignal.timeout(UPDATE_CHECK_TIMEOUT_MS),
    );
    const result = availableReleaseFromGithub(install, candidate, currentVersion);
    const cache: UpdateCheckCache = {
      lastCheckedAt: now(),
      latestVersion: result.latestVersion,
      url: result.releaseUrl,
      dismissedVersion: readUpdateCheckCache(path)?.dismissedVersion ?? null,
      lastNoticeAt: readUpdateCheckCache(path)?.lastNoticeAt,
    };
    writeUpdateCheckCache(path, cache);
    return cache;
  } catch {
    return null;
  }
}

let prefetchPromise: Promise<UpdateCheckCache | null> | null = null;
let prefetchPath: string | null = null;

/** Fire-and-forget refresh so a short command can finish the GET before exit. */
export function prefetchCliUpdateCheck(deps: UpdateCheckDeps = {}): void {
  const home = deps.home ?? homedir;
  const path = updateCheckCachePath(home());
  prefetchPath = path;
  prefetchPromise ??= refreshUpdateCheckCache(path, deps).finally(() => {
    prefetchPromise = null;
  });
}

function waitForPrefetch(ms: number): void {
  if (!prefetchPromise) return;
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (!prefetchPromise) return;
    sleepSync(25);
  }
}

export function formatCliUpdateNotice(result: UpdateCheckResult): string {
  const latest = result.latestVersion ?? "?";
  return (
    `A new RepoOS release is available: v${latest} (you have v${result.currentVersion}). ` +
    `Run: ${result.upgradeCommand}   (release notes: ${result.releaseUrl})`
  );
}

function noticeAllowed(
  cache: UpdateCheckCache | null,
  available: boolean,
  now: number,
): boolean {
  if (!available) return false;
  if (!cache) return true;
  if (!cache.lastNoticeAt) return true;
  return now - cache.lastNoticeAt >= UPDATE_CHECK_TTL_MS;
}

/**
 * Synchronous exit hook: may block up to ~1.5s waiting for an in-flight prefetch.
 * Never throws.
 */
export function emitCliUpdateNoticeOnExit(deps: UpdateCheckDeps = {}): void {
  try {
    const now = deps.now ?? Date.now;
    const home = deps.home ?? homedir;
    const path = prefetchPath ?? updateCheckCachePath(home());
    waitForPrefetch(UPDATE_CHECK_TIMEOUT_MS);

    const cache = readUpdateCheckCache(path);
    if (!cache) return;

    const root = (deps.installRoot ?? installRoot)();
    const installVersion = (deps.readInstallVersion ?? readInstallVersion)(root);
    const install = releaseFromInstall(root, installVersion);
    if (install.installKind === "source") return;

    const currentVersion = (deps.readVersion ?? readVersion)();
    const latestVersion = cache?.latestVersion;
    const available = isNewerVersion(latestVersion ?? "", currentVersion);
    if (!noticeAllowed(cache, available, now())) return;

    const releaseUrl = cache?.url ?? DEFAULT_RELEASE_URL;
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
      lastCheckedAt: cache?.lastCheckedAt ?? now(),
      latestVersion: latestVersion ?? null,
      url: releaseUrl,
      dismissedVersion: cache?.dismissedVersion ?? null,
      lastNoticeAt: now(),
    });
  } catch {
    /* silent */
  }
}

export function registerCliUpdateNoticeHook(input: {
  cmd: string | undefined;
  argv: string[];
  config?: Pick<RepoOSConfig, "updates">;
  deps?: UpdateCheckDeps;
}): void {
  if (!shouldRunCliUpdateCheck(input)) return;
  prefetchCliUpdateCheck(input.deps);
  process.once("exit", () => emitCliUpdateNoticeOnExit(input.deps));
}

/** Exported for tests — refresh cache when stale and return the parsed result. */
export async function checkForRepoosUpdate(
  deps: UpdateCheckDeps = {},
): Promise<UpdateCheckResult | null> {
  const home = deps.home ?? homedir;
  const path = updateCheckCachePath(home());
  const now = deps.now ?? Date.now;
  const root = (deps.installRoot ?? installRoot)();
  const installVersion = (deps.readInstallVersion ?? readInstallVersion)(root);
  const install = releaseFromInstall(root, installVersion);
  if (install.installKind === "source") return null;

  const currentVersion = (deps.readVersion ?? readVersion)();
  const cached = readUpdateCheckCache(path);
  if (cached && now() - cached.lastCheckedAt < UPDATE_CHECK_TTL_MS) {
    return {
      currentVersion,
      latestVersion: cached.latestVersion,
      available: isNewerVersion(cached.latestVersion ?? "", currentVersion),
      releaseUrl: cached.url ?? DEFAULT_RELEASE_URL,
      upgradeCommand: install.upgradeCommand,
      installKind: install.installKind,
    };
  }
  const fresh = await refreshUpdateCheckCache(path, deps);
  if (!fresh) return null;
  return {
    currentVersion,
    latestVersion: fresh.latestVersion,
    available: isNewerVersion(fresh.latestVersion ?? "", currentVersion),
    releaseUrl: fresh.url ?? DEFAULT_RELEASE_URL,
    upgradeCommand: install.upgradeCommand,
    installKind: install.installKind,
  };
}
