/**
 * Remote Validation Runner (#RVR).
 *
 * The close-out gate's expensive half — `bun install` + `bun run build` +
 * `bun run test` — is what makes MTD fail on the developer's machine under
 * memory pressure (see docs/remote-validation.md). This module runs that half
 * on a remote machine via one of two providers:
 *
 * **hetzner** (default) — disposable cloud VM, provisioned on demand:
 *   1. ensure a runner VM exists (create from a prebuilt snapshot, or reuse a
 *      still-warm one), one at a time, never more than one
 *   2. `git bundle` the already-merged candidate tree and scp it up
 *   3. ssh in and run `/opt/repoos/validate.sh` inside the `repoos-ci` Docker
 *      image, stream output, pull artifacts, then arm an idle-shutdown timer
 *
 * **tailscale** — persistent machine on your tailnet, no VM lifecycle:
 *   1. `git bundle` the candidate tree and scp it to the tailnet host
 *   2. ssh in and run `docker run --rm` with the gate script — fresh container
 *      every time, persistent bun-cache volume for speed
 *   3. stream output and pull artifacts (same as Hetzner path)
 *
 * The result is shaped as a {@link CheckSummary} so it is a drop-in for
 * `runCloseOutCheck` in both close-out paths (done.ts, integration-
 * orchestrator.ts). Infra failures (provisioning, ssh, an unreachable host)
 * come back with `transient: true` — the caller decides whether to fail
 * retryably or fall back to a local run (`remoteValidation.fallbackToLocal`).
 * A configuration/routing failure (no host provides a required capability)
 * comes back with `transient: false, configError: true` instead: retrying
 * cannot fix a missing host, and letting `fallbackToLocal` swallow it would
 * run macOS-bound work on the wrong machine (#0521 review).
 *
 * Use {@link createRemoteValidator} (called by server.ts) to get the right
 * implementation for the configured provider.
 */

import { spawn } from "node:child_process";
import { writeChildStdin } from "../core/child-stdin.js";
import { createHash, randomBytes } from "node:crypto";
import { createConnection } from "node:net";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  appendFileSync,
  existsSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { RepoOSConfig, RemoteValidationConfig, RemoteValidationHost } from "../core/types.js";
import {
  describeCapabilities,
  hostRunner,
  hostSatisfies,
  positiveLimit,
  remoteHostLimit,
  remoteHostUser,
  resolveRemoteHosts,
} from "../core/remote-hosts.js";
import type { Logger } from "../core/logger.js";
import { remoteRunHistoryMeta } from "../core/check-failure-summary.js";
import { getCheckStore, type CheckRunPhase } from "../core/check-store.js";
import type { CheckSummary } from "./done.js";
import { redactSecrets, stripAnsi } from "./done.js";
import { runGit } from "../core/git.js";

export type { CheckSummary } from "./done.js";
import { createHetznerClient, type HetznerClient, type HetznerServer } from "./hetzner.js";

/** Label every runner VM carries, so leaked ones are always findable. */
const RUNNER_LABEL_KEY = "repoos-ci";
const RUNNER_LABEL_SELECTOR = `${RUNNER_LABEL_KEY}=1`;
const SSH_PORT = 22;

/** The caller's deadline passed while the job was still queued (#0521). */
export class QueueDeadlineError extends Error {}

export interface RemoteHost {
  ip: string;
  user: string;
  /** Path to the private key. Omit to let SSH use its default resolution (agent, ~/.ssh/config). */
  keyPath?: string;
}

/** A queued acquire: its resolve, plus the deadline timer that may cancel it. */
interface GateWaiter {
  resolve: () => void;
  timer?: ReturnType<typeof setTimeout>;
}

/**
 * FIFO concurrency limiter for remote runs (#0520). Every caller in the server
 * process (handoff, close-out, release) shares one runner instance, so a limit
 * here serialises them: two full suites on one machine is exactly the memory
 * and CPU contention the runner exists to avoid, and a run that times out or
 * trips a timing-sensitive test under that load would be reported as a red gate
 * ("fix it in the branch") when the branch is fine.
 *
 * A released slot is handed straight to the next waiter (the active count does
 * not dip), so a burst cannot overshoot the limit.
 *
 * A waiter may carry the caller's `deadlineAt` (#0521 spec item 5): when it
 * expires the waiter is removed from the queue and rejected with
 * {@link QueueDeadlineError} without ever holding a slot — a queued run never
 * outlives the caller that gave up on it.
 */
export class ConcurrencyGate {
  private active = 0;
  private readonly waiters: GateWaiter[] = [];

  constructor(readonly limit: number) {}

  /** Runs in flight plus runs waiting — what a new arrival queues behind. */
  get pending(): number {
    return this.active + this.waiters.length;
  }

  async acquire(
    onQueued?: (ahead: number) => void,
    opts: { deadlineAt?: number } = {},
  ): Promise<() => void> {
    if (this.active < this.limit) {
      this.active++;
    } else {
      onQueued?.(this.pending);
      await new Promise<void>((resolve, reject) => {
        if (opts.deadlineAt !== undefined && opts.deadlineAt <= Date.now()) {
          reject(
            new QueueDeadlineError("the caller's deadline passed before a remote slot was free"),
          );
          return;
        }
        const waiter: GateWaiter = { resolve };
        if (opts.deadlineAt !== undefined) {
          waiter.timer = setTimeout(() => {
            const i = this.waiters.indexOf(waiter);
            if (i === -1) return; // already handed a slot; the release path owns it
            this.waiters.splice(i, 1);
            reject(
              new QueueDeadlineError(
                "the caller's deadline passed while this run was queued — it was cancelled",
              ),
            );
          }, opts.deadlineAt - Date.now());
          waiter.timer.unref?.();
        }
        this.waiters.push(waiter);
      });
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.waiters.shift();
      if (next) {
        if (next.timer) clearTimeout(next.timer);
        next.resolve();
      } else this.active--;
    };
  }
}

/** Limit from config: a positive integer, default 1 (one run at a time). */
export function remoteConcurrencyLimit(config: RepoOSConfig): number {
  return positiveLimit(config.remoteValidation?.maxConcurrent, 1);
}

/** Per-run remote paths, so overlapping runs never share a bundle or artifacts dir. */
export interface RemoteRunPaths {
  bundle: string;
  artifacts: string;
}

/**
 * Unique per run: two runs for the same task (a retry starting while the last is
 * still going) must not collide either, and the runner script used to `rm -rf` a
 * single fixed artifacts dir at the start of every run, wiping a concurrent
 * run's logs. Task ids come from routes and synthetic ids ("pre-review",
 * "checks-test-suite"); keep the path shell-safe regardless.
 */
export function remoteRunPaths(
  taskId: string,
  runId = randomBytes(4).toString("hex"),
): RemoteRunPaths {
  const safe = taskId.replace(/[^A-Za-z0-9_.-]/g, "_") || "run";
  return {
    // Under the remote user's home, not /tmp or /var/tmp (#0512 follow-up,
    // corrected same-day): a Linux host's /tmp is commonly a RAM-backed
    // tmpfs with a per-user quota shared with the desktop session running on
    // it — repoos's own churn there can hit "disk quota exceeded" for
    // reasons unrelated to the task. /var/tmp dodges that but broke
    // validation on a macOS host running Docker Desktop: its bind-mount
    // file sharing does NOT include /tmp or /var/tmp by default (verified
    // live — a bind-mounted /var/tmp dir showed empty inside the container,
    // "bun could not find a package.json"), only paths under $HOME. `~/` is
    // real disk on Linux too (not the quota-capped tmpfs), so it satisfies
    // both constraints. Resolved remotely (ssh/scp expand `~` server-side),
    // not here — this process doesn't know the remote user's home path.
    bundle: `~/.repoos-${safe}-${runId}.bundle`,
    artifacts: `~/.repoos-artifacts/${safe}-${runId}`,
  };
}

/**
 * A persistent bare mirror the runner keeps per repo, so a run only has to
 * upload the commits the host does not already have (#0717). Its name is
 * derived from the repo's absolute root so two different repos validated by one
 * host never share a mirror — a plain basename would collide (two `opex`
 * checkouts) and fold unrelated histories together.
 */
export function remoteMirrorPath(root: string): string {
  const base = (root.split(/[\\/]/).filter(Boolean).pop() ?? "repo").replace(
    /[^A-Za-z0-9_.-]/g,
    "_",
  );
  const suffix = createHash("sha1").update(root).digest("hex").slice(0, 8);
  return `~/.repoos-cache/${base}-${suffix}.git`;
}

/** Ref the candidate commit travels under; a stable name validate.sh knows. */
export const MIRROR_CANDIDATE_REF = "refs/repoos/candidate";
/** Ref the pre-fetched main tip travels under, for scoped `--changed` runs. */
export const MIRROR_SCOPE_REF = "refs/repoos/scope";

/** What a host's persistent mirror currently holds (#0717). */
export interface RemoteMirrorState {
  exists: boolean;
  /** ref name → commit sha, for the refs the runner cares about. */
  refs: Record<string, string>;
}

/** Probe result when the host has no mirror yet (full-bundle fallback). */
export const EMPTY_REMOTE_MIRROR: RemoteMirrorState = { exists: false, refs: {} };

/**
 * One ssh command that reports the mirror's refs as `<ref> <sha>` lines, or
 * nothing when the mirror is absent. Kept to a single call so a warm host with
 * a mirror costs one round-trip before bundling.
 */
export function mirrorProbeCommand(mirrorPath: string): string {
  const refs = [MIRROR_CANDIDATE_REF, MIRROR_SCOPE_REF];
  const checks = refs
    .map(
      (r) =>
        `git -C ${shellQuote(mirrorPath)} rev-parse --verify --quiet ${shellQuote(r)} 2>/dev/null`,
    )
    .join("; ");
  return (
    `if [ -d ${shellQuote(mirrorPath)} ]; then echo MIRROR=1; ` +
    `${checks}; else echo MIRROR=0; fi`
  );
}

/** Parse {@link mirrorProbeCommand} output into a {@link RemoteMirrorState}. */
export function parseMirrorProbeOutput(
  output: string,
  refs: string[] = [MIRROR_CANDIDATE_REF, MIRROR_SCOPE_REF],
): RemoteMirrorState {
  const trimmed = output.trim();
  if (!trimmed.includes("MIRROR=1")) return { exists: false, refs: {} };
  const shas = trimmed
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^[0-9a-f]{40}$/.test(l));
  const result: Record<string, string> = {};
  refs.forEach((ref, i) => {
    const sha = shas[i];
    if (sha) result[ref] = sha;
  });
  return { exists: true, refs: result };
}

export interface RemoteExecResult {
  code: number | null;
  output: string;
  timedOut: boolean;
}

/**
 * The IO surface of the runner, injected so tests can substitute fakes and
 * never touch a real API, network, or subprocess.
 */
export interface RemoteExecDeps {
  /**
   * `git bundle create <outPath> <refs…> [^<exclude>…]` in `cwd`.
   * `refs` are the positive refs the bundle records; `excludeRefs` are
   * prerequisites the host already holds, so the bundle carries only what is
   * new (`<base>..HEAD`) — the whole point of #0717.
   */
  bundleRepo(
    cwd: string,
    outPath: string,
    opts?: { refs?: string[]; excludeRefs?: string[] },
  ): Promise<{ ok: boolean; detail?: string }>;
  /** `scp <localPath> <host>:<remotePath>`. */
  uploadFile(
    host: RemoteHost,
    localPath: string,
    remotePath: string,
  ): Promise<{ ok: boolean; detail?: string }>;
  /**
   * Ask whether the host's persistent mirror exists and which refs it holds.
   * Optional: a runner (or test double) that cannot probe simply reports no
   * mirror, so the run falls back to the full-history bundle (#0717).
   */
  probeMirror?(host: RemoteHost, mirrorPath: string): Promise<RemoteMirrorState>;
  /** `scp -r <host>:<remotePath> <localDir>` — best effort, never throws. */
  downloadDir(host: RemoteHost, remotePath: string, localDir: string): Promise<void>;
  /** `ssh <host> <command>`, streaming combined stdout+stderr through `onChunk`. */
  runRemote(
    host: RemoteHost,
    command: string,
    onChunk: (chunk: string) => void,
    timeoutMs: number,
  ): Promise<RemoteExecResult>;
  /** TCP connect probe (used to wait for sshd to come up). */
  probeTcp(ip: string, port: number, timeoutMs: number): Promise<boolean>;
}

export interface ValidateOptions {
  taskId: string;
  /** The already-merged candidate worktree (or task worktree). */
  worktreePath: string;
  /** Expected `git rev-parse HEAD` of `worktreePath` — the VM asserts it matches. */
  candidateSha: string;
  /** Live output sink (SSE, status bar). The per-task log file is always written. */
  onChunk?: (chunk: string) => void;
  /**
   * Which gate is dispatching this run (#0564) — recorded in the check-run
   * history so a remote run can be told apart from the local one it precedes.
   */
  phase?: CheckRunPhase;
  /**
   * Host capabilities this job needs (#0521) — the `runsOn` union of the check
   * plan. The pool only considers hosts providing every one of them; a job with
   * no requirement runs anywhere. Absent means "any host".
   */
  capabilities?: string[];
  /**
   * Epoch ms after which the caller no longer wants this job (#0521): a run
   * still QUEUED at the deadline is cancelled and its slot released instead of
   * outliving the caller that gave up on it (the handoff's 10-minute cap).
   * A run already executing is not interrupted.
   */
  deadlineAt?: number;
  /**
   * When set, the runner bundles this ref alongside HEAD and runs
   * `bun run test -- --changed <ref>` (#0695). Handoff and close-out omit it.
   */
  changedRef?: string;
}

/** One host's live state, surfaced by `/api/remote-validation/status` (#0521). */
export interface RemoteHostStatus {
  host: string;
  user: string;
  os?: string;
  labels: string[];
  /** Effective per-host in-flight cap (per-host → global → 1). */
  maxConcurrent: number;
  /** Runs this server process currently has in flight on the host. */
  inFlight: number;
  /** Queued runs currently waiting for this host. */
  queued: number;
  /** Whether the prerequisite check (docker/toolchain + validate.sh) ran. */
  probed: boolean;
  /** Result of that check. Only meaningful when `probed`. */
  healthy: boolean;
  /** Why the host is unusable (prereq failure / unreachable), when it is. */
  detail?: string;
  /** Most recent run dispatched here, for the drawer's per-host state. */
  lastRun?: { taskId: string; ok: boolean; at: string; durationMs?: number };
  /**
   * In-flight runs with WHO is running and since when (#0564) — the Remote
   * runners tab shows "#0564 · 2m 10s", not just a count.
   */
  activeRuns?: {
    taskId: string;
    startedAt: string;
    phase?: string;
    label?: string;
    source?: "server" | "host-lock";
  }[];
  /** Task ids of the queued runs waiting for THIS host, FIFO order (#0564). */
  queuedTasks?: string[];
  serverStats?: RemoteServerStats;
  /** Host-side lock holders + waiters sampled over SSH (#0705). */
  hostLock?: HostLockSnapshot;
  /** Standalone / host-lock waiters with phase and queue position (#0705). */
  lockWaiters?: {
    taskId: string;
    phase: string;
    label: string;
    queuePosition?: number;
    ageSecs: number;
  }[];
}

export interface RemoteServerStats {
  available: boolean;
  sampledAt?: string;
  loadAverage?: [number, number, number];
  cpuCount?: number;
  memoryUsedBytes?: number;
  memoryTotalBytes?: number;
  diskFreeBytes?: number;
  detail?: string;
}

export interface RemoteValidator {
  validate(opts: ValidateOptions): Promise<CheckSummary>;
  /** Delete leaked runner VMs. Call at server boot (nothing is validating then). */
  reconcile(): Promise<void>;
  /** Tear down any warm VM and cancel timers. Call on server shutdown. */
  dispose(): Promise<void>;
  /** Absolute path of the per-task log file (may not exist yet). */
  logPath(taskId: string): string;
  /**
   * Structured per-task events for the task's Debug tab (#0568): which host
   * ran, the exit code, and any infra/config error. Optional so a runner that
   * does not record them (or a test double) stays a valid validator.
   */
  remoteEvents?(taskId: string): RemoteValidationEvent[];
  /** Per-host pool state for the status endpoint (#0521). Optional: the
   *  Hetzner runner is a single server-owned VM with no pool to report. */
  hostStatus?(): RemoteHostStatus[];
  /** Start non-blocking, independent SSH sampling for configured pool hosts. */
  refreshHostStats?(): void;
  /** Sample host-side validate locks for the Remote runners tab (#0705). */
  refreshHostLocks?(): void;
  /**
   * Rebuild dispatch state from the live config after a Settings / raw-TOML
   * save. Without this the pool keeps the boot-time host list until restart
   * (#0521 review). Optional: Hetzner has no pool to rebuild.
   */
  applyConfig?(): void;
  /**
   * In-flight remote runs with their current stage and host, for the
   * slow-run detector (#0720). Optional so a runner that does not track
   * stages (or a test double) stays a valid validator.
   */
  activeRemoteRuns?(): ActiveRemoteRunInfo[];
}

/** One in-flight remote run, as the slow-run detector (#0720) needs it. */
export interface ActiveRemoteRunInfo {
  taskId: string;
  host: string;
  phase: CheckRunPhase;
  scope: string;
  startedAt: string;
  /** e.g. `bundle`, `upload`, `queue`, `lock`, `run`, `install`, `test`. */
  stage: string | null;
  uploadBytes: number | null;
  uploadSeconds: number | null;
}

/**
 * In-flight remote runs keyed by task id — shared by Hetzner and Tailscale
 * runners so the slow-run detector (#0720) sees every provider the same way.
 */
export class ActiveRemoteRunRegistry {
  private readonly runs = new Map<string, ActiveRemoteRunInfo>();

  list(): ActiveRemoteRunInfo[] {
    return [...this.runs.values()].map((r) => ({ ...r }));
  }

  set(info: ActiveRemoteRunInfo | null, taskId: string): void {
    if (info) this.runs.set(taskId, info);
    else this.runs.delete(taskId);
  }
}

interface RunnerState {
  serverId: number;
  ip: string;
  createdAt: string;
}

/** Tunable time budgets, overridable in tests so the polling loops don't sleep for real. */
export interface RunnerTimings {
  provisionPollMs: number;
  provisionTimeoutMs: number;
  sshProbeIntervalMs: number;
  sshWaitTimeoutMs: number;
  /** Outer cap on the remote build+test run. Vitest's own testTimeout fails a real hang faster. */
  remoteRunTimeoutMs: number;
  /** Cap on one host's prerequisite probe (a single ssh round trip). */
  probeTimeoutMs: number;
  /** Cooldown before an unreachable/misconfigured host is probed again (#0521). */
  healthRetryMs: number;
  /** Re-probe hosts that are still unprobed or unhealthy (#0683). */
  backgroundProbeIntervalMs: number;
}

const DEFAULT_TIMINGS: RunnerTimings = {
  provisionPollMs: 4_000,
  provisionTimeoutMs: 180_000,
  sshProbeIntervalMs: 3_000,
  sshWaitTimeoutMs: 120_000,
  remoteRunTimeoutMs: 25 * 60_000,
  probeTimeoutMs: 20_000,
  healthRetryMs: 30_000,
  backgroundProbeIntervalMs: 60_000,
};

/** Contention-shaped failure text — matches runDoneStep's heuristic in done.ts. */
function looksTransient(output: string): boolean {
  return /(?:timed out waiting for|test timed out|worker .*?(?:timeout|exited)|ETIMEDOUT|Killed|out of memory|Cannot allocate memory)/i.test(
    output,
  );
}

/** Last few non-empty lines, redacted and de-ANSI'd, bounded. */
function tail(output: string, lines = 20, maxChars = 1200): string {
  const cleaned = redactSecrets(stripAnsi(output))
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.trim());
  let out = cleaned.slice(-lines).join("\n");
  if (out.length > maxChars) out = `…${out.slice(out.length - maxChars)}`;
  return out || "no output";
}

/** Human-readable byte count for run logs (e.g. "812 B", "1.1 MB"). */
function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "unknown";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = units[0]!;
  for (let i = 1; value >= 1024 && i < units.length; i++) {
    value /= 1024;
    unit = units[i]!;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${unit}`;
}

// ── per-task remote-validation events (#0568) ───────────────────────────────

/**
 * One structured remote-validation event for a task (#0568). The raw log under
 * `.repoos/logs/remote-validation/<taskId>.log` is a human-readable stream
 * (also streamed live to the running check's output); this is the structured
 * mirror the task's Debug tab reads, so an infra failure — an SSH drop, an
 * unreachable host, a cancelled queue wait, missing provider config — is
 * legible without opening the log file. `message` is the whole story; the other
 * fields let the UI badge the event (which host, what exit code, infra vs. a
 * genuine red test gate).
 */
export interface RemoteValidationEvent {
  at: string;
  level: "info" | "warn" | "error";
  /** Where in the run's life the event happened. */
  phase: "queued" | "dispatch" | "run" | "result";
  message: string;
  /** The runner/host this event concerns (ran, or was skipped). */
  host?: string;
  /** Remote process exit code, when the event comes from a finished run. */
  exitCode?: number | null;
  /** The run failed for infra reasons, not because the branch's tests failed. */
  infra?: boolean;
  /** No config change could make this run pass (routing/misconfiguration). */
  configError?: boolean;
}

/** `<taskId>.events.ndjson` beside the per-task raw remote log. */
export function remoteEventsPath(root: string, taskId: string): string {
  const safe = taskId.replace(/[^A-Za-z0-9_.-]/g, "_") || "run";
  return join(root, ".repoos", "logs", "remote-validation", `${safe}.events.ndjson`);
}

/** Append one structured event; best-effort, never throws (mirrors appendLog). */
export function appendRemoteValidationEvent(
  root: string,
  taskId: string,
  event: Omit<RemoteValidationEvent, "at">,
): void {
  try {
    mkdirSync(join(root, ".repoos", "logs", "remote-validation"), { recursive: true });
    const entry: RemoteValidationEvent = { at: new Date().toISOString(), ...event };
    appendFileSync(remoteEventsPath(root, taskId), JSON.stringify(entry) + "\n", "utf8");
  } catch {
    /* best effort — observability must never fail a run */
  }
}

/**
 * Read a task's structured remote-validation events, oldest first. Bounded like
 * the raw-log read: only the tail of the file is parsed, so a task with a long
 * retry history cannot make the Debug tab fetch unbounded JSON.
 */
export function readRemoteValidationEvents(
  root: string,
  taskId: string,
  limit = 500,
): RemoteValidationEvent[] {
  const p = remoteEventsPath(root, taskId);
  let text = "";
  try {
    if (existsSync(p)) text = readFileSync(p, "utf8").slice(-500_000);
  } catch {
    return [];
  }
  const out: RemoteValidationEvent[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as RemoteValidationEvent);
    } catch {
      /* skip a torn/partial trailing line */
    }
  }
  return out.slice(Math.max(0, out.length - limit));
}

/** Fields a failure path supplies so its event is complete. */
interface RemoteEventContext {
  taskId?: string;
  host?: string;
  exitCode?: number | null;
  phase?: RemoteValidationEvent["phase"];
}

// ── host prerequisites + the cross-process host lock (#0521) ────────────────

/** The gate script every host must carry, and the token a passing probe prints. */
export const VALIDATE_SCRIPT = "/opt/repoos/validate.sh";
export const PREREQ_OK_TOKEN = "REPOOS_PREREQ_OK";
/** The named Docker volume validate.sh caches bun installs in — must match
 *  `CACHE_VOLUME` in scripts/remote-runner/validate.sh exactly (#0521 review,
 *  third round: a named volume, not a host bind-mount — see that script's
 *  own comment for why). */
export const CACHE_VOLUME_NAME = "repoos-bun-cache";
/** Exit code a host-lock timeout uses — never a test suite's own exit. */
export const HOST_LOCK_TIMEOUT_EXIT = 75;
/** Default a run waits inside the host lock before giving up (15 min). */
export const DEFAULT_HOST_LOCK_WAIT_SECS = 900;
/**
 * A lock dir whose heartbeat stopped for this long belongs to a killed run;
 * break it. Deliberately SHORTER than {@link DEFAULT_HOST_LOCK_WAIT_SECS}: a
 * waiter only waits that long, so a threshold beyond the wait budget (the old
 * 40 minutes vs a 15-minute wait) meant the next waiter timed out with a
 * misleading "another repoos check is still running" before the orphan dir was
 * even breakable — a wait budget can only ever recover a lock that goes stale
 * inside it (#0521 review). What makes a short threshold safe is the
 * heartbeat: a live holder refreshes its dir every HOST_LOCK_HEARTBEAT_SECS,
 * so staleness now means "holder died", never "holder is merely running" —
 * the run's 25-minute cap no longer has to fit under the stale window.
 */
export const HOST_LOCK_STALE_MINUTES = 10;
/** How often a holder refreshes its lock dir while its suite runs. */
export const HOST_LOCK_HEARTBEAT_SECS = 60;
/**
 * Heartbeat tick cap: an orphaned heartbeat (holder SIGKILLed, subshell
 * survived) stops by itself after this many ticks — at the default 60 s, 30
 * minutes, comfortably past the 25-minute run cap so no LIVE run goes quiet.
 */
export const HOST_LOCK_HEARTBEAT_TICKS = 30;
/** Slot indices 0..N-1 on a host — independent of any one caller's limit (#0521 review). */
export const HOST_LOCK_MAX_SLOTS = 16;

/** One job holding or waiting for a host-side validate lock (#0705). */
export interface HostLockJob {
  state: "holding" | "waiting";
  /** Task id when known; absent for anonymous standalone runs. */
  taskId?: string;
  /** Human label — `#0693` or `standalone check in <worktree>`. */
  label: string;
  /** Gate phase for display: self-check / pre-review / close-out / release. */
  phase: string;
  ageSecs: number;
  /** 1-based position among waiters on this host (waiters only). */
  queuePosition?: number;
  slotIndex?: number;
}

export interface HostLockSnapshot {
  holders: HostLockJob[];
  waiters: HostLockJob[];
  sampledAt?: string;
}

/** Host-lock priority: close-out and release beat engineer self-checks (#0705). */
export function hostLockPriority(
  phase?: CheckRunPhase,
  env: NodeJS.ProcessEnv = process.env,
): number {
  if (phase === "close-out") return 100;
  if (phase === "release") return 90;
  if (phase === "pre-review" && env.REPOOS_AGENT === "1") return 30;
  if (phase === "pre-review") return 60;
  if (phase === "cli") return 40;
  return 40;
}

/** Display phase for the Remote runners tab (#0705). */
export function hostLockPhaseLabel(
  phase?: CheckRunPhase,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (phase === "pre-review" && env.REPOOS_AGENT === "1") return "self-check";
  if (phase === "cli") return "self-check";
  return phase ?? "self-check";
}

export function hostLockMetaJson(opts: {
  taskId: string;
  phase?: CheckRunPhase;
  worktree?: string;
  priority: number;
  env?: NodeJS.ProcessEnv;
}): string {
  const env = opts.env ?? process.env;
  const phase = hostLockPhaseLabel(opts.phase, env);
  const worktree = opts.worktree?.trim();
  return JSON.stringify({
    taskId: opts.taskId,
    phase,
    priority: opts.priority,
    worktree: worktree || undefined,
  });
}

/** Remote shell: line-oriented lock inspect (no jq) (#0705). */
export function hostLockInspectShell(lockRoot?: string): string {
  const raw = (lockRoot ?? "~/.repoos-validate-locks").replace(/'/g, "");
  const lockLine = raw.startsWith("~/")
    ? `LOCKROOT="$HOME/${raw.slice(2).replace(/["\\$]/g, "")}"`
    : `LOCKROOT='${raw}'`;
  return [
    lockLine,
    "NOW=$(date +%s)",
    'echo "__HOST_LOCK__"',
    'if [ -d "$LOCKROOT" ]; then',
    '  for _d in "$LOCKROOT"/[0-9]*; do',
    '    [ -d "$_d" ] || continue',
    '    _slot=$(basename "$_d")',
    '    _age=$((NOW - $(stat -f %m "$_d" 2>/dev/null || stat -c %Y "$_d" 2>/dev/null || echo "$NOW")))',
    '    echo "hold\t$_slot\t$_age"',
    '    [ -r "$_d/.meta" ] && cat "$_d/.meta"',
    "  done",
    '  if [ -d "$LOCKROOT/wait" ]; then',
    "    _pos=0",
    '    for _wf in "$LOCKROOT/wait"/*; do',
    '      [ -f "$_wf" ] || continue',
    "      _pos=$((_pos+1))",
    '      _age=$((NOW - $(stat -f %m "$_wf" 2>/dev/null || stat -c %Y "$_wf" 2>/dev/null || echo "$NOW")))',
    '      echo "wait\t$_pos\t$_age"',
    '      tail -n +2 "$_wf" 2>/dev/null',
    "    done",
    "  fi",
    "fi",
  ].join("\n");
}

function parseHostLockMeta(raw: string | undefined): {
  taskId?: string;
  phase?: string;
  worktree?: string;
} {
  if (!raw?.trim()) return {};
  try {
    const o = JSON.parse(raw.trim()) as Record<string, unknown>;
    return {
      taskId: typeof o.taskId === "string" ? o.taskId : undefined,
      phase: typeof o.phase === "string" ? o.phase : undefined,
      worktree: typeof o.worktree === "string" ? o.worktree : undefined,
    };
  } catch {
    return {};
  }
}

function hostLockJobLabel(meta: ReturnType<typeof parseHostLockMeta>, taskId?: string): string {
  const id = meta.taskId ?? taskId;
  if (id && id !== "pre-review" && id !== "?") return `#${id}`;
  if (meta.worktree) {
    const parts = meta.worktree.replace(/\\/g, "/").split("/").filter(Boolean);
    const tail = parts.slice(-2).join("/") || meta.worktree;
    return `standalone check in ${tail}`;
  }
  return "standalone check";
}

/** Parse {@link hostLockInspectShell} output into a snapshot (#0705). */
export function parseHostLockInspectOutput(output: string, sampledAt?: string): HostLockSnapshot {
  const holders: HostLockJob[] = [];
  const waiters: HostLockJob[] = [];
  const lines = output.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.startsWith("hold\t") && !line.startsWith("wait\t")) {
      i++;
      continue;
    }
    const [kind, a, b] = line.split("\t");
    const ageSecs = Math.max(0, Number(b) || 0);
    const metaLine = lines[i + 1]?.trim();
    const meta = parseHostLockMeta(metaLine);
    i += metaLine?.startsWith("{") ? 2 : 1;
    if (kind === "hold") {
      holders.push({
        state: "holding",
        slotIndex: Number(a),
        ageSecs,
        phase: meta.phase ?? "self-check",
        label: hostLockJobLabel(meta),
        taskId: meta.taskId,
      });
    } else {
      waiters.push({
        state: "waiting",
        queuePosition: Number(a) || waiters.length + 1,
        ageSecs,
        phase: meta.phase ?? "self-check",
        label: hostLockJobLabel(meta),
        taskId: meta.taskId,
      });
    }
  }
  return { holders, waiters, sampledAt };
}

export function formatHostLockHolderSummary(lock?: HostLockSnapshot): string {
  if (!lock?.holders.length) return "";
  const parts = lock.holders.map((h) => `${h.label} (${h.phase}, ${h.ageSecs}s)`);
  return ` — slot held by ${parts.join("; ")}`;
}

export function mergeHostLockIntoStatus(
  base: RemoteHostStatus,
  lock?: HostLockSnapshot,
): RemoteHostStatus {
  if (!lock) return base;
  const serverTaskIds = new Set((base.activeRuns ?? []).map((r) => r.taskId));
  const extraRuns = lock.holders
    .filter((h) => !h.taskId || !serverTaskIds.has(h.taskId))
    .map((h) => ({
      taskId: h.taskId ?? h.label,
      startedAt: new Date(Date.now() - h.ageSecs * 1000).toISOString(),
      phase: h.phase,
      label: h.label,
      source: "host-lock" as const,
    }));
  const activeRuns = [
    ...(base.activeRuns ?? []).map((r) => ({ ...r, source: "server" as const })),
    ...extraRuns,
  ];
  const lockWaiters = lock.waiters.map((w) => ({
    taskId: w.taskId ?? w.label,
    phase: w.phase,
    label: w.label,
    queuePosition: w.queuePosition,
    ageSecs: w.ageSecs,
  }));
  const holderCount = lock.holders.length;
  const inFlight = Math.max(base.inFlight, holderCount);
  const queued = base.queued + lock.waiters.length;
  const queuedTasks = [
    ...lock.waiters.map((w) => w.taskId ?? w.label),
    ...(base.queuedTasks ?? []),
  ];
  return {
    ...base,
    inFlight,
    queued,
    activeRuns,
    queuedTasks,
    hostLock: lock,
    lockWaiters,
  };
}

/**
 * Per-host prerequisite check (#0521) run over ssh before a host's first job,
 * so a misconfigured host is REPORTED (health + detail in the status endpoint)
 * instead of failing jobs with an opaque error mid-run. Checks the toolchain
 * the host's `validate.sh` needs and that the script is an up-to-date copy
 * accepting the per-run artifacts dir as its third argument (#0520).
 *
 * Branches on `runner`, NOT `os` (#0521 review, twice over): `os` is a job
 * capability ("does this host provide macos/linux for `runsOn`"), entirely
 * orthogonal to HOW a host executes `validate.sh`. Two prior versions of
 * this got it wrong in opposite directions — checking bun/git unconditionally
 * on macOS (fails a real Docker-based macOS host) and checking Docker
 * unconditionally everywhere (fails a real native macOS host) — because both
 * conflated the two concerns into one `os` switch. `runner` says explicitly
 * which toolchain THIS host actually uses (default "docker" — the
 * maintained `just setup-<host>` path; "native" opts in via
 * `just setup-<host>-native`, macOS only today), independent of its `os`.
 *
 * For `runner: "docker"` (the default), also checks the CONFIGURED image
 * (`remoteValidation.containerImage`, default "repoos-ci") actually exists
 * on the host — a reachable Docker daemon with the daemon itself healthy but
 * the image never built/pulled used to be reported healthy anyway, then
 * fail every job it received (#0521 review).
 */
export function prereqProbeCommand(
  runner?: "docker" | "native",
  containerImage = "repoos-ci",
): string {
  const image = containerImage.trim().replace(/'/g, "") || "repoos-ci";
  const lines =
    runner === "native"
      ? [
          'command -v git >/dev/null 2>&1 || { echo "git not found on PATH"; exit 1; }',
          "(command -v bun >/dev/null 2>&1 || [ -x /opt/homebrew/bin/bun ]) || " +
            '{ echo "bun not found (install it, e.g. brew install bun)"; exit 1; }',
        ]
      : [
          // git runs on the HOST for every runner, not just native — the
          // clone/checkout step in validate.sh happens before `docker run`
          // is ever invoked, so a Docker host missing git was previously
          // reported healthy and failed at the very first step of every job
          // (#0521 review).
          'command -v git >/dev/null 2>&1 || { echo "git not found on PATH"; exit 1; }',
          'command -v docker >/dev/null 2>&1 || { echo "docker not found on PATH"; exit 1; }',
          'docker info >/dev/null 2>&1 || { echo "docker daemon not reachable (is docker running?)"; exit 1; }',
          `docker image inspect ${shellQuote(image)} >/dev/null 2>&1 || ` +
            `{ echo ${shellQuote(`image '${image}' not found — build it (just setup-<host>) or fix remoteValidation.containerImage`)}; exit 1; }`,
        ];
  lines.push(
    ...(runner === "native"
      ? [
          // Native: bun runs directly as this SSH user, no container/uid
          // involved, so a plain write-then-remove of the real cache path
          // is an accurate test. A host that can run bun+git but whose cache
          // dir can't actually be created/written (bad permissions, a stray
          // file, a full/read-only volume) used to be reported healthy and
          // fail its first real job on `bun install` — this probe never
          // touched that path at all (#0521 review, criterion 6).
          '_rvcache="$HOME/.cache/repoos-bun" && ' +
            'mkdir -p "$_rvcache" 2>/dev/null && ' +
            'touch "$_rvcache/.repoos-probe" 2>/dev/null && rm -f "$_rvcache/.repoos-probe" 2>/dev/null || ' +
            '{ echo "bun cache dir $_rvcache is not writable"; exit 1; }',
        ]
      : [
          // Docker: the cache is a named volume validate.sh chowns to uid
          // 1000 (the bun base image's user) before every real run — NOT a
          // host bind-mount. An earlier version of this check tested a host
          // directory's writability instead; on a real host that failed in
          // two different ways in two different review rounds (checking the
          // SSH user's own — trivially true — access, then confirmed live
          // that even a permissive host chmod is invisible to the container
          // on macOS/Colima, which maps a bind-mounted dir to root:root
          // 0755 inside the VM regardless of the real host-side
          // permissions). A named volume sidesteps that whole class of
          // host-filesystem-mapping problem, so probe the EXACT sequence
          // validate.sh runs — chown as root, then write as uid 1000 — for
          // ground truth instead of approximating it (#0521 review, third
          // round).
          `docker volume create ${CACHE_VOLUME_NAME} >/dev/null 2>&1 && ` +
            `docker run --rm -v ${CACHE_VOLUME_NAME}:/bun-cache -u 0 ${shellQuote(image)} ` +
            `"chown 1000:1000 /bun-cache" >/dev/null 2>&1 && ` +
            `docker run --rm -v ${CACHE_VOLUME_NAME}:/bun-cache -u 1000 ${shellQuote(image)} ` +
            `"touch /bun-cache/.repoos-probe && rm -f /bun-cache/.repoos-probe" >/dev/null 2>&1 || ` +
            `{ echo "bun cache volume ${CACHE_VOLUME_NAME} is not writable by the container even after chown as root"; exit 1; }`,
        ]),
    `[ -f ${VALIDATE_SCRIPT} ] || ` +
      `{ echo "missing ${VALIDATE_SCRIPT} — run the per-host install (docs/remote-validation.md)"; exit 1; }`,
    // Single-quoted '${3' is a fixed-string grep for the artifacts argument the
    // #0520 validate.sh reads; older copies lack it.
    "grep -qF '${3' " +
      `${VALIDATE_SCRIPT} || ` +
      `{ echo "outdated ${VALIDATE_SCRIPT}: it must accept the artifacts dir as its third argument — re-run the per-host install"; exit 1; }`,
    `echo ${PREREQ_OK_TOKEN}`,
  );
  return lines.join(" &&\n");
}

/**
 * Host-side slot lock (#0521): a portable `mkdir`-based counting semaphore
 * wrapped around `validate.sh`, so a standalone `repoos check` (its own
 * process, its own in-memory gate) and the server's runner can never put two
 * full suites on one host beyond its per-host limit. `mkdir` is atomic
 * everywhere, unlike `flock(1)` which macOS doesn't ship.
 *
 * While the suite runs the holder HEARTBEATS its slot dir (touch every
 * HOST_LOCK_HEARTBEAT_SECS), so a dir untouched for HOST_LOCK_STALE_MINUTES
 * provably belongs to a killed run and is broken by the next waiter — the
 * stale threshold can therefore sit comfortably inside the wait budget, which
 * is what lets a waiter actually recover an orphan within one wait (#0521
 * review: with a static 40-minute threshold and a 15-minute wait, the next
 * waiter always gave up before the orphan was breakable).
 *
 * The lock waits (with a clear streamed line) and exits
 * HOST_LOCK_TIMEOUT_EXIT when it runs out of patience — the runner reports
 * that as a transient "another check is running" infra failure, never as a
 * red gate.
 */
export function hostLockShell(opts: {
  slots: number;
  waitSecs: number;
  /**
   * Lock root on the host. Deliberately HOST-GLOBAL (default
   * `~/.repoos-validate-locks` — under the remote user's home like every
   * other repoos scratch path, never `/tmp`/`/var/tmp`, per the #0528/#0544
   * runner-scratch fixes), not per-repo: the cap exists because of machine
   * load, so two different repos validated on the same host share its slots —
   * one machine = one suite, whoever asked for it (#0521 review).
   *
   * KNOWN LIMIT, not fixed here (#0521 review, second round): two different
   * SSH users on the same host get separate `$HOME`s, hence separate lock
   * namespaces, so the "one machine, one shared cap" intent only holds
   * within one SSH user. Moving the lock root to a genuinely shared path
   * like `/var/tmp` would restore that, but it isn't a safe swap: unlike the
   * validate WORK dir (large, one-shot, never touched by another user),
   * this lock's stale-slot cleanup removes directories a DIFFERENT user's
   * run may have created — `/tmp`/`/var/tmp`'s sticky bit (mode 1777) blocks
   * exactly that unless the cleanup runs as that directory's owner or root.
   * Fixing this for real needs either a shared, non-sticky lock directory
   * provisioned once during host setup (owned by a group both SSH users
   * belong to) or accepting per-user caps as the documented behavior.
   * Left as a real, open limitation for a single-SSH-user host pool (the
   * only configuration this repo's own `just setup-<host>` recipes ever
   * produce) rather than guessed at here.
   */
  lockRoot?: string;
  /** Stale threshold in minutes (tests shrink this). */
  staleMinutes?: number;
  /** Heartbeat interval in seconds (tests shrink this). */
  heartbeatSecs?: number;
  /** Heartbeat tick cap (tests shrink this). */
  heartbeatTicks?: number;
  /**
   * The caller's ABSOLUTE deadline (unix epoch seconds), when it has one.
   * `waitSecs` alone is a budget computed and fixed on the LOCAL side before
   * this command is even sent over SSH — connection time then silently eats
   * into it with the remote shell none the wiser, so a slow SSH handshake
   * could let a run start well past the caller's real deadline (#0521
   * review). When set, the remote script self-clocks against its OWN
   * `date +%s` compared to this absolute value instead of counting elapsed
   * sleeps from zero, which is immune to however long it took to get here —
   * and it refuses to even attempt the FIRST acquisition once already past
   * it, rather than opportunistically grabbing a slot that happens to be
   * free the instant it starts (`waitSecs: 0` alone did not prevent that:
   * the acquire attempt ran before the wait-loop's own timeout check).
   * Absent: falls back to today's `waitSecs`-only relative counting (a
   * caller with no deadline, e.g. a standalone `repoos check`).
   */
  deadlineAtEpochSecs?: number;
  /** JSON metadata written to the slot's `.meta` file (#0705). */
  metaJson?: string;
  /** Wait-queue priority — close-out beats self-check (#0705). */
  priority?: number;
  inner: string;
}): string {
  // `~` would NOT expand inside the single-quoted LOCKROOT assignment below,
  // so the home-relative default is emitted as $HOME/… explicitly; any
  // caller-provided absolute root stays single-quoted (and quote-stripped).
  const raw = (opts.lockRoot ?? "~/.repoos-validate-locks").replace(/'/g, "");
  const lockLine = raw.startsWith("~/")
    ? `LOCKROOT="$HOME/${raw.slice(2).replace(/["\\$]/g, "")}"`
    : `LOCKROOT='${raw}'`;
  const slots = Math.max(1, Math.floor(opts.slots));
  const wait = Math.max(0, Math.floor(opts.waitSecs));
  const deadline =
    opts.deadlineAtEpochSecs !== undefined ? Math.floor(opts.deadlineAtEpochSecs) : undefined;
  // Floor of 1: `-mmin +0` would break even a fresh dir the moment it ages
  // past one truncated minute, which a live holder only notices too late.
  const stale = Math.max(1, Math.floor(opts.staleMinutes ?? HOST_LOCK_STALE_MINUTES));
  const beat = Math.max(1, Math.floor(opts.heartbeatSecs ?? HOST_LOCK_HEARTBEAT_SECS));
  const ticks = Math.max(1, Math.floor(opts.heartbeatTicks ?? HOST_LOCK_HEARTBEAT_TICKS));
  const priority = Math.max(0, Math.floor(opts.priority ?? 40));
  const metaShell = opts.metaJson ? shellQuote(opts.metaJson) : "";
  const script = [
    lockLine,
    `SLOTS=${slots}`,
    `HOSTMAX=${HOST_LOCK_MAX_SLOTS}`,
    `WAIT=${wait}`,
    `PRIORITY=${priority}`,
    `DEADLINE=${deadline !== undefined ? deadline : ""}`,
    'WAITDIR="$LOCKROOT/wait"',
    'mkdir -p "$WAITDIR" 2>/dev/null || true',
    '[ "$WAIT" -gt 0 ] || [ -n "$DEADLINE" ] && {',
    metaShell
      ? `  printf '%s\\n' "$PRIORITY" > "$WAITDIR/$$" && printf '%s\\n' ${metaShell} >> "$WAITDIR/$$"`
      : `  printf '%s\\n' "$PRIORITY" > "$WAITDIR/$$"`,
    "}",
    // zsh throws "no matches found" when a glob expands to nothing (unlike bash/sh
    // which pass the literal string — caught by the `[ -d ]` guard below).
    // nullglob makes unmatched globs expand to nothing instead of erroring.
    "setopt nullglob 2>/dev/null; shopt -s nullglob 2>/dev/null; true",
    'mkdir -p "$LOCKROOT" 2>/dev/null || true',
    // Refuse to even ATTEMPT the first acquisition once already past the
    // caller's absolute deadline — self-clocked on this host's own `date`,
    // so however long SSH took to get here is already accounted for. A
    // free slot happening to be available right now must not be grabbed for
    // a caller that has already given up (#0521 review).
    '[ -n "$DEADLINE" ] && [ "$(date +%s)" -ge "$DEADLINE" ] && {',
    '  echo "[lock] the deadline had already passed before this host could attempt to acquire a slot"',
    `  exit ${HOST_LOCK_TIMEOUT_EXIT}`,
    "}",
    '_rvslot=""',
    "_rvwaited=0",
    'while [ -z "$_rvslot" ]; do',
    "  _defer=0",
    '  if [ "$WAIT" -gt 0 ] || [ -n "$DEADLINE" ]; then',
    '  for _wf in "$WAITDIR"/*; do',
    '    [ -f "$_wf" ] || continue',
    '    _wpid=$(basename "$_wf")',
    '    [ "$_wpid" = "$$" ] && continue',
    "    _opri=0",
    '    IFS= read -r _opri < "$_wf" || _opri=0',
    '    case "$_opri" in ""|*[!0-9]*) _opri=0 ;; esac',
    '    if [ "$_opri" -gt "$PRIORITY" ] || { [ "$_opri" -eq "$PRIORITY" ] && [ "$_wpid" -lt "$$" ]; }; then',
    "      _defer=1",
    "      break",
    "    fi",
    "  done",
    '  if [ "$_defer" -eq 1 ]; then',
    "    sleep 5",
    "    _rvwaited=$((_rvwaited+5))",
    "    continue",
    "  fi",
    "  fi",
    // Host-wide cap = min(this caller's limit, every occupied slot's limit).
    // Scan all slot indices (HOSTMAX), not just 0..SLOTS-1, so a caller with
    // a lower limit cannot grab a free high index while another run holds a
    // different index (#0521 review).
    "  _rvoccupied=0",
    "  _rvcap=$SLOTS",
    '  for _rvdir in "$LOCKROOT"/[0-9]*; do',
    '    [ -d "$_rvdir" ] || continue',
    "    _rvoccupied=$((_rvoccupied+1))",
    "    _rvother=1",
    '    [ -r "$_rvdir/.limit" ] && IFS= read -r _rvother < "$_rvdir/.limit"',
    '    case "$_rvother" in ""|*[!0-9]*) _rvother=1 ;; esac',
    '    [ "$_rvother" -ge 1 ] || _rvother=1',
    '    [ "$_rvother" -lt "$_rvcap" ] && _rvcap=$_rvother',
    "  done",
    '  if [ "$_rvoccupied" -lt "$_rvcap" ]; then',
    "    _i=0",
    '    while [ "$_i" -lt "$HOSTMAX" ]; do',
    '      if mkdir "$LOCKROOT/$_i" 2>/dev/null; then',
    '        if ! printf "%s\\n" "$SLOTS" > "$LOCKROOT/$_i/.limit"; then rmdir "$LOCKROOT/$_i" 2>/dev/null; _i=$((_i+1)); continue; fi',
    "        _rvcount=0",
    "        _rvcap2=$SLOTS",
    '        for _rvdir in "$LOCKROOT"/[0-9]*; do',
    '          [ -d "$_rvdir" ] || continue',
    "          _rvcount=$((_rvcount+1))",
    "          _rvother=1",
    '          [ -r "$_rvdir/.limit" ] && IFS= read -r _rvother < "$_rvdir/.limit"',
    '          case "$_rvother" in ""|*[!0-9]*) _rvother=1 ;; esac',
    '          [ "$_rvother" -ge 1 ] || _rvother=1',
    '          [ "$_rvother" -lt "$_rvcap2" ] && _rvcap2=$_rvother',
    "        done",
    '        if [ "$_rvcount" -le "$_rvcap2" ]; then _rvslot=$_i;',
    ...(metaShell
      ? [`          printf '%s\\n' ${metaShell} > "$LOCKROOT/$_rvslot/.meta" 2>/dev/null || true`]
      : []),
    '          rm -f "$WAITDIR/$$" 2>/dev/null || true',
    "          break; fi",
    '        rm -f "$LOCKROOT/$_i/.limit"; rmdir "$LOCKROOT/$_i" 2>/dev/null',
    "      fi",
    "      _i=$((_i+1))",
    "    done",
    "  fi",
    '  [ -n "$_rvslot" ] && break',
    // Self-clocked against the absolute deadline when there is one (immune
    // to setup delay); otherwise the original relative-elapsed counter.
    '  if { [ -n "$DEADLINE" ] && [ "$(date +%s)" -ge "$DEADLINE" ]; } || ' +
      '{ [ -z "$DEADLINE" ] && [ "$_rvwaited" -ge "$WAIT" ]; }; then',
    '    echo "[lock] timed out after ${_rvwaited}s waiting for a free slot on this host — another repoos check is still running"',
    `    exit ${HOST_LOCK_TIMEOUT_EXIT}`,
    "  fi",
    '  [ "$_rvwaited" -eq 0 ] && echo "[lock] waiting for a free slot on this host (up to ${WAIT}s)"',
    // Orphan recovery: a dir (or stray file a crashed touch once left) with no
    // heartbeat for ${stale} minutes belongs to a dead holder — break it.
    `  find "$LOCKROOT" -mindepth 1 -maxdepth 1 -type d -mmin +${stale} -exec rm -rf {} + 2>/dev/null || true`,
    `  find "$LOCKROOT" -mindepth 1 -maxdepth 1 -type f -mmin +${stale} -exec rm -f {} + 2>/dev/null || true`,
    "  sleep 5",
    "  _rvwaited=$((_rvwaited+5))",
    "done",
    'echo "[lock] slot $_rvslot acquired after ${_rvwaited}s"',
    // Heartbeat: refresh this slot's dir while we live, so staleness means
    // "holder died", never "holder is slow". Stops at our pid's death (a
    // waiter can then break the dir) or the tick cap (an orphaned heartbeat
    // can't outlive a normal run's whole window). The `[ -d ]` guard keeps a
    // heartbeat that lost the race with a stale-break from resurrecting the
    // dir as a plain file that would jam `mkdir` forever.
    "_rvpid=$$",
    "_rvbeat() {",
    "  _n=0",
    `  while [ "$_n" -lt ${ticks} ] && kill -0 "$_rvpid" 2>/dev/null; do`,
    `    sleep ${beat}`,
    '    [ -d "$LOCKROOT/$_rvslot" ] || break',
    '    touch "$LOCKROOT/$_rvslot" 2>/dev/null || break',
    "    _n=$((_n+1))",
    "  done",
    "}",
    // Redirect the heartbeat's own fds to /dev/null: cleanup kills the
    // subshell mid-`sleep`, and that orphaned sleep must NOT inherit the
    // command's stdout/stderr — doing so held the ssh (and test) pipe open
    // for up to a full heartbeat interval after every run.
    "_rvbeat >/dev/null 2>&1 &",
    "_rvhb=$!",
    '_rvcleanup() { _rc=$?; kill "$_rvhb" 2>/dev/null; rm -f "$LOCKROOT/$_rvslot/.limit" "$LOCKROOT/$_rvslot/.meta"; rmdir "$LOCKROOT/$_rvslot" 2>/dev/null; rm -f "$WAITDIR/$$" 2>/dev/null; exit $_rc; }',
    "trap _rvcleanup EXIT",
    "trap 'exit 129' HUP",
    "trap 'exit 130' INT",
    "trap 'exit 143' TERM",
    opts.inner,
  ];
  return script.join("\n");
}

/** Quote one value for a POSIX shell word (including embedded single quotes). */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Lock wait budget for a run carrying the caller's deadline — never past it
 * (#0521 spec item 5). `hostLockShell` checks its budget in 5-second steps and
 * tries the slot BEFORE checking it, so the budget is rounded down to a whole
 * number of steps: every acquisition attempt then lands at or before the
 * deadline. `0` still takes a free slot immediately; it just never sleeps (the
 * old `Math.max(10, …)` floor let a run whose caller had already given up
 * enter the lock up to 10 s late and run a full suite holding the slot).
 */
export function deadlineLockWaitSecs(deadlineAt: number, now = Date.now()): number {
  const remainSecs = Math.floor((deadlineAt - now) / 1000);
  return Math.max(0, Math.min(DEFAULT_HOST_LOCK_WAIT_SECS, 5 * Math.floor(remainSecs / 5)));
}

// ── default IO implementation ────────────────────────────────────────────────

function sshArgs(host: RemoteHost): string[] {
  return [
    ...(host.keyPath ? ["-i", host.keyPath] : []),
    "-o",
    "BatchMode=yes",
    "-o",
    "StrictHostKeyChecking=accept-new",
    "-o",
    "ConnectTimeout=15",
    "-o",
    "UserKnownHostsFile=/dev/null",
    "-o",
    "LogLevel=ERROR",
  ];
}

function runLocalWithStdin(
  cmd: string,
  args: string[],
  stdin: Buffer,
  opts: { timeoutMs: number },
): Promise<RemoteExecResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    let timedOut = false;
    let settled = false;
    const done = (code: number | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, output, timedOut });
    };
    child.stdout?.on("data", (b: Buffer) => {
      output += b.toString("utf8");
    });
    child.stderr?.on("data", (b: Buffer) => {
      output += b.toString("utf8");
    });
    child.on("error", (e) => {
      output += `\n[spawn error: ${(e as Error).message}]\n`;
      done(null);
    });
    child.on("close", (code) => done(code));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, opts.timeoutMs);
    writeChildStdin(child, stdin, {
      command: cmd,
      end: true,
      onError: (e) => {
        output += `\n[stdin error: ${e.message}]\n`;
        done(null);
      },
    });
  });
}

function runLocal(
  cmd: string,
  args: string[],
  opts: { cwd?: string; timeoutMs: number; onChunk?: (c: string) => void },
): Promise<RemoteExecResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: opts.cwd });
    let output = "";
    let timedOut = false;
    let settled = false;
    const done = (code: number | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, output, timedOut });
    };
    const onData = (b: Buffer): void => {
      const s = b.toString("utf8");
      output += s;
      opts.onChunk?.(s);
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("error", (e) => {
      output += `\n[could not spawn ${cmd}: ${(e as Error).message}]\n`;
      done(null);
    });
    child.on("close", (code) => done(code));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, opts.timeoutMs);
  });
}

/** How engineer self-checks scope remote vitest (#0695). */
export type RemoteChangedTestScope =
  | { scoped: false; warning?: string }
  | { scoped: true; ref: string; baseSha: string };

/**
 * Resolve `--changed` / `REPOOS_CHECK_CHANGED` for the remote runner. When the
 * ref does not resolve, returns full-suite mode and a warning string for logs.
 */
export async function remoteChangedTestScope(
  worktreePath: string,
  changedRef?: string,
): Promise<RemoteChangedTestScope> {
  const ref = changedRef?.trim();
  if (!ref) return { scoped: false };
  const res = await runGit(worktreePath, ["rev-parse", "--verify", ref], 15_000);
  if (res.status !== 0) {
    return {
      scoped: false,
      warning: `could not resolve changed ref "${ref}" for remote tests — running the full suite on the runner, not a scoped self-check`,
    };
  }
  return { scoped: true, ref, baseSha: res.stdout.trim() };
}

async function prepareRemoteTestBundle(
  worktreePath: string,
  changedRef: string | undefined,
  emit: (line: string) => void,
): Promise<{ remoteTestRef: string | null; changedBaseSha: string | null }> {
  const testScope = await remoteChangedTestScope(worktreePath, changedRef);
  if (!testScope.scoped && testScope.warning) {
    emit(`[remote validation] WARNING: ${testScope.warning}\n`);
  }
  if (!testScope.scoped) {
    return { remoteTestRef: null, changedBaseSha: null };
  }
  // The scope ref (e.g. `main`) travels as a NAMED ref so the runner can run
  // `--changed main`; the base sha both names that ref and bounds the partial
  // bundle (#0717).
  return { remoteTestRef: testScope.ref, changedBaseSha: testScope.baseSha };
}

export function validateScriptArgs(
  remoteBundle: string,
  candidateSha: string,
  artifactsDir: string,
  changedRef?: string,
  mirrorPath?: string,
): string {
  const parts = [VALIDATE_SCRIPT, remoteBundle, candidateSha, artifactsDir];
  const ref = changedRef?.trim();
  // $4 is the changed ref and $5 the mirror path. When a mirror is passed
  // without a changed ref (handoff and close-out run the full suite), $4 must
  // still be present as an empty placeholder: otherwise the mirror path lands
  // in $4, the script sees no mirror and clones the mirror-ref bundle directly
  // ("cloned an empty repository") — the 2026-10-07 regression after #0717.
  if (ref || mirrorPath) parts.push(ref ? shellQuote(ref) : "''");
  // Mirror path is appended last so an older installed validate.sh (which reads
  // only $4 as the changed ref) still receives a valid positional layout.
  if (mirrorPath) parts.push(shellQuote(mirrorPath));
  return parts.join(" ");
}

export function defaultRemoteExec(): RemoteExecDeps {
  return {
    async bundleRepo(cwd, outPath, opts) {
      const refs = [...(opts?.refs ?? ["HEAD"])];
      // `^<base>` prerequisites: the host already holds these commits, so only
      // the commits after them travel (#0717).
      const excludes = (opts?.excludeRefs ?? []).map((r) => `^${r}`);
      const res = await runLocal("git", ["bundle", "create", outPath, ...refs, ...excludes], {
        cwd,
        timeoutMs: 120_000,
      });
      return res.code === 0 ? { ok: true } : { ok: false, detail: tail(res.output) };
    },
    async uploadFile(host, localPath, remotePath) {
      // Use SSH pipe instead of scp to avoid Tailscale MTU issues with the
      // SFTP subsystem — plain SSH data channel handles large files reliably.
      const fileData = readFileSync(localPath);
      const res = await runLocalWithStdin(
        "ssh",
        [...sshArgs(host), `${host.user}@${host.ip}`, `cat > ${remotePath}`],
        fileData,
        { timeoutMs: 120_000 },
      );
      return res.code === 0 ? { ok: true } : { ok: false, detail: tail(res.output) };
    },
    async probeMirror(host, mirrorPath) {
      const res = await runLocal(
        "ssh",
        [...sshArgs(host), `${host.user}@${host.ip}`, mirrorProbeCommand(mirrorPath)],
        { timeoutMs: 20_000 },
      ).catch(() => undefined);
      if (!res || res.code !== 0) return { exists: false, refs: {} };
      return parseMirrorProbeOutput(res.output);
    },
    async downloadDir(host, remotePath, localDir) {
      mkdirSync(localDir, { recursive: true });
      await runLocal(
        "scp",
        [...sshArgs(host), "-r", `${host.user}@${host.ip}:${remotePath}`, localDir],
        { timeoutMs: 120_000 },
      ).catch(() => undefined);
    },
    async runRemote(host, command, onChunk, timeoutMs) {
      return runLocal("ssh", [...sshArgs(host), `${host.user}@${host.ip}`, command], {
        timeoutMs,
        onChunk,
      });
    },
    probeTcp(ip, port, timeoutMs) {
      return new Promise((resolve) => {
        const socket = createConnection({ host: ip, port });
        const done = (ok: boolean): void => {
          socket.destroy();
          resolve(ok);
        };
        socket.setTimeout(timeoutMs);
        socket.once("connect", () => done(true));
        socket.once("timeout", () => done(false));
        socket.once("error", () => done(false));
      });
    },
  };
}

// ── incremental candidate upload (#0717) ─────────────────────────────────────

/** Result of bundling + uploading the candidate tree to a host. */
export type PreparedUpload =
  | {
      ok: true;
      bundlePath: string;
      bundleBytes: number;
      uploadSecs: number;
      /** True when only `<base>..HEAD` was uploaded (host held the base). */
      partial: boolean;
      baseSha: string | null;
      mirrorPath: string;
    }
  | { ok: false; stage: "bundle" | "upload"; detail: string; hostGone: boolean };

const UPLOAD_ATTEMPTS = 3;

/**
 * Bundle the candidate tree and upload it to a host, transferring only commits
 * the host does not already have (#0717).
 *
 * A persistent bare mirror on the host (`~/.repoos-cache/<repo>.git`) holds the
 * last candidate it validated. When the host reports a commit the candidate
 * descends from, the bundle excludes it (`<base>..HEAD`) and is a few KB instead
 * of the full ~100 MB history. On the first run, or when the host has no mirror
 * or lacks a usable base, it falls back to the full bundle. The upload is
 * retried a few times instead of restarting the whole run.
 */
export async function prepareCandidateUpload(
  exec: RemoteExecDeps,
  opts: {
    host: RemoteHost;
    /** Local path to write the bundle to (owned by the caller's tmp dir). */
    bundlePath: string;
    /** Where the bundle lands on the host. */
    remoteBundle: string;
    worktreePath: string;
    candidateSha: string;
    changedRef?: string;
    /** The changed-ref base sha, when the run is scoped (#0695). */
    changedBaseSha?: string | null;
    mirrorPath: string;
    emit: (s: string) => void;
  },
): Promise<PreparedUpload> {
  const { host, bundlePath, remoteBundle, worktreePath, candidateSha, mirrorPath, emit } = opts;

  // 1. Ask the host what its mirror already holds (one round-trip). A failed
  //    probe, or a runner with no probe at all, is not fatal: treat it as "no
  //    mirror" and send the full bundle.
  const mirror = exec.probeMirror
    ? await exec.probeMirror(host, mirrorPath).catch(() => EMPTY_REMOTE_MIRROR)
    : EMPTY_REMOTE_MIRROR;
  const hostShas = mirror.exists ? Object.values(mirror.refs) : [];

  // 2. Pick a base the host holds that the candidate is built on. Prefer the
  //    newest such base so the bundle is smallest; never pick the candidate
  //    itself. For a scoped run the base must be a STRICT ancestor of the scope
  //    ref's tip: excluding the base also excludes the scope tip itself when
  //    they are equal, which would drop the `refs/repoos/scope` ref the runner
  //    needs to run `--changed <ref>` (validate.sh re-fetches it from the
  //    bundle). Base == scope tip is therefore not usable for a partial bundle.
  const scopeBase = opts.changedBaseSha ?? null;
  let baseSha: string | null = null;
  for (const sha of hostShas) {
    if (!sha || sha === candidateSha) continue;
    if (!(await isAncestor(worktreePath, sha, candidateSha))) continue;
    if (scopeBase) {
      if (sha === scopeBase) continue;
      if (!(await isAncestor(worktreePath, sha, scopeBase))) continue;
    }
    if (baseSha === null || (await isAncestor(worktreePath, baseSha, sha))) baseSha = sha;
  }

  // 3. Stage the refs the bundle must record, under per-run names so concurrent
  //    runs in one repo never race on a shared ref. validate.sh re-fetches them
  //    into the mirror under the stable names it knows. If the refs cannot be
  //    staged (not a git worktree, a read-only git dir, an exotic checkout) the
  //    mirror cannot be used at all — fall back to the legacy full `HEAD`
  //    bundle and tell the runner to clone it directly (`mirrorPath: ""`).
  const runTag = randomBytes(4).toString("hex");
  const candidateRef = `refs/repoos/candidate-${runTag}`;
  const staged = await updateRef(worktreePath, candidateRef, candidateSha);
  let refs: string[] = ["HEAD"];
  let excludeRefs: string[] = [];
  let effectiveMirror = "";
  if (staged) {
    refs = [candidateRef];
    effectiveMirror = mirrorPath;
    excludeRefs = baseSha ? [baseSha] : [];
    if (scopeBase) {
      const scopeRef = `refs/repoos/scope-${runTag}`;
      if (await updateRef(worktreePath, scopeRef, scopeBase)) refs.push(scopeRef);
    }
  }

  const bundle = await exec.bundleRepo(worktreePath, bundlePath, { refs, excludeRefs });
  if (!bundle.ok) {
    return { ok: false, stage: "bundle", detail: bundle.detail ?? "unknown", hostGone: false };
  }
  if (!staged) baseSha = null;
  let bundleBytes = 0;
  try {
    bundleBytes = statSync(bundlePath).size;
  } catch {
    /* size is observability only */
  }

  // 4. Upload, retrying a failed transfer instead of losing the whole run. The
  //    bundle is already local, so a retry re-sends it (a partial bundle is
  //    small; a full one is the case this feature is meant to avoid repeating).
  const uploadStartedAt = Date.now();
  let lastDetail = "";
  for (let attempt = 1; attempt <= UPLOAD_ATTEMPTS; attempt++) {
    const up = await exec.uploadFile(host, bundlePath, remoteBundle);
    if (up.ok) {
      const uploadSecs = Math.round((Date.now() - uploadStartedAt) / 100) / 10;
      return {
        ok: true,
        bundlePath,
        bundleBytes,
        uploadSecs,
        partial: baseSha !== null,
        baseSha,
        mirrorPath: effectiveMirror,
      };
    }
    lastDetail = up.detail ?? "unknown";
    if (attempt < UPLOAD_ATTEMPTS) {
      emit(`[upload attempt ${attempt} failed (${lastDetail}) — retrying]\n`);
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  return { ok: false, stage: "upload", detail: lastDetail, hostGone: true };
}

async function isAncestor(cwd: string, ancestor: string, descendant: string): Promise<boolean> {
  const res = await runGit(cwd, ["merge-base", "--is-ancestor", ancestor, descendant], 15_000);
  return res.status === 0;
}

async function updateRef(cwd: string, ref: string, sha: string): Promise<boolean> {
  const res = await runGit(cwd, ["update-ref", ref, sha], 15_000);
  return res.status === 0;
}

// ── the runner ──────────────────────────────────────────────────────────────

export class RemoteValidationRunner implements RemoteValidator {
  private readonly hetzner: HetznerClient;
  private readonly exec: RemoteExecDeps;
  private readonly timings: RunnerTimings;
  private readonly keyPath: string;
  private readonly gate: ConcurrencyGate;
  private readonly sshUser = "root";
  private state: RunnerState | null = null;
  /**
   * Server id this process adopted from the shared state file at construction,
   * i.e. a VM ANOTHER process (the server) provisioned. `dispose()` must not
   * delete it: a short-lived `repoos check` adopting the server's warm VM would
   * otherwise kill a close-out that is validating on it, or force the next one
   * to pay a fresh provisioning delay.
   */
  private adoptedServerId: number | null = null;
  /** In-flight provisioning, so concurrent validate() calls share one VM. */
  private provisioning: Promise<RemoteHost> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private lifetimeTimer: ReturnType<typeof setTimeout> | null = null;
  private activeJobs = 0;
  private readonly activeRunRegistry = new ActiveRemoteRunRegistry();

  constructor(
    private readonly config: RepoOSConfig,
    private readonly logger?: Logger,
    deps?: { hetzner?: HetznerClient; exec?: RemoteExecDeps; timings?: Partial<RunnerTimings> },
  ) {
    const token = process.env.HETZNER_API_TOKEN ?? "";
    this.hetzner = deps?.hetzner ?? createHetznerClient(token);
    this.exec = deps?.exec ?? defaultRemoteExec();
    this.timings = { ...DEFAULT_TIMINGS, ...deps?.timings };
    this.keyPath = process.env.REPOOS_REMOTE_SSH_KEY ?? "";
    this.gate = new ConcurrencyGate(remoteConcurrencyLimit(config));
    this.loadState();
  }

  logPath(taskId: string): string {
    return join(this.config.root, ".repoos", "logs", "remote-validation", `${taskId}.log`);
  }

  /** Structured events for the Debug tab (#0568). */
  remoteEvents(taskId: string): RemoteValidationEvent[] {
    return readRemoteValidationEvents(this.config.root, taskId);
  }

  private stateFile(): string {
    return join(this.config.root, ".repoos", "remote-runner.json");
  }

  private loadState(): void {
    try {
      const raw = readFileSync(this.stateFile(), "utf8");
      const parsed = JSON.parse(raw) as RunnerState;
      if (parsed && typeof parsed.serverId === "number") {
        this.state = parsed;
        this.adoptedServerId = parsed.serverId;
      }
    } catch {
      this.state = null;
    }
  }

  private saveState(): void {
    try {
      mkdirSync(join(this.config.root, ".repoos"), { recursive: true });
      if (this.state) writeFileSync(this.stateFile(), JSON.stringify(this.state, null, 2));
      else if (existsSync(this.stateFile())) rmSync(this.stateFile(), { force: true });
    } catch {
      /* state file is a convenience, not a source of truth */
    }
  }

  private appendLog(taskId: string, text: string): void {
    try {
      const p = this.logPath(taskId);
      mkdirSync(join(this.config.root, ".repoos", "logs", "remote-validation"), {
        recursive: true,
      });
      appendFileSync(p, redactSecrets(text));
    } catch {
      /* best effort */
    }
  }

  private maxLifetimeMs(): number {
    return (this.config.remoteValidation?.maxServerLifetimeMinutes ?? 120) * 60_000;
  }

  private idleMs(): number {
    return (this.config.remoteValidation?.idleShutdownMinutes ?? 8) * 60_000;
  }

  /** Infra failure → transient CheckSummary the caller can retry or fall back on. */
  private infraFail(detail: string, ctx: RemoteEventContext = {}): CheckSummary {
    this.logger?.system("warn", `remote validation unavailable: ${detail}`);
    this.record(ctx, {
      level: "warn",
      phase: ctx.phase ?? "result",
      message: `remote validation unavailable: ${detail}`,
      infra: true,
    });
    return {
      ok: false,
      stage: "check",
      transient: true,
      detail: `remote validation unavailable: ${detail}`,
    };
  }

  /**
   * Configuration/routing failure → NON-retryable CheckSummary (#0521 review):
   * no host provides a capability this job needs. Retrying without a config
   * change cannot succeed, and letting `fallbackToLocal` swallow it would run
   * e.g. macOS-bound work on the wrong machine instead of failing clearly.
   */
  private configFail(detail: string, ctx: RemoteEventContext = {}): CheckSummary {
    this.logger?.system("error", `remote validation cannot run: ${detail}`);
    this.record(ctx, {
      level: "error",
      phase: ctx.phase ?? "dispatch",
      message: `remote validation cannot run: ${detail}`,
      infra: false,
      configError: true,
    });
    return {
      ok: false,
      stage: "check",
      transient: false,
      configError: true,
      detail: `remote validation cannot run: ${detail}`,
    };
  }

  /** Append a structured event when a task id is known (best-effort). */
  private record(ctx: RemoteEventContext, event: Omit<RemoteValidationEvent, "at">): void {
    if (!ctx.taskId) return;
    appendRemoteValidationEvent(this.config.root, ctx.taskId, {
      ...event,
      host: event.host ?? ctx.host,
      exitCode: event.exitCode ?? ctx.exitCode,
    });
  }

  /** In-flight runs with stage metadata, for the slow-run detector (#0720). */
  activeRemoteRuns(): ActiveRemoteRunInfo[] {
    return this.activeRunRegistry.list();
  }

  private setActiveRunStage(info: ActiveRemoteRunInfo | null, taskId: string): void {
    this.activeRunRegistry.set(info, taskId);
  }

  async validate(opts: ValidateOptions): Promise<CheckSummary> {
    // Routing (#0521): the Hetzner runner is always one Linux/docker VM. A job
    // requiring anything else must fail here, clearly, not run in the wrong OS
    // — and as a CONFIG error, never as transient infra a caller could retry
    // away or paper over with `fallbackToLocal`.
    const unmet = (opts.capabilities ?? [])
      .map((c) => c.trim())
      .filter((c) => c && c.toLowerCase() !== "linux");
    if (unmet.length > 0) {
      return this.configFail(
        `the Hetzner runner provides only "linux" — cannot satisfy ${unmet.join(", ")}; ` +
          "configure a [[remoteValidation.tailscaleHosts]] host that provides it (docs/remote-validation.md)",
        { taskId: opts.taskId },
      );
    }
    // Queue deadline (#0521 spec item 5): a run still queued when its caller
    // gives up is cancelled and never holds a slot — the same promise the
    // Tailscale pool's queue timer makes (this path used to ignore
    // `deadlineAt` entirely, so a queued Hetzner run could outlive the
    // handoff's 10-minute deadline).
    let release: () => void;
    const startedAt = Date.now();
    try {
      release = await this.gate.acquire(
        (ahead) => {
          const note =
            `[queued behind ${ahead} other remote run(s) — remoteValidation.maxConcurrent = ` +
            `${this.gate.limit}; starts when a slot frees]\n`;
          this.appendLog(opts.taskId, note);
          opts.onChunk?.(note);
          appendRemoteValidationEvent(this.config.root, opts.taskId, {
            level: "info",
            phase: "queued",
            message: note.trim(),
          });
        },
        { deadlineAt: opts.deadlineAt },
      );
    } catch (e) {
      const detail = e instanceof QueueDeadlineError ? e.message : `remote slot wait failed: ${e}`;
      const note = `[remote validation not started: ${detail}]\n`;
      this.appendLog(opts.taskId, note);
      opts.onChunk?.(note);
      recordRemoteRunHistory(
        this.config,
        opts,
        startedAt,
        null,
        e instanceof QueueDeadlineError ? "cancelled" : "fail",
        detail,
      );
      return this.infraFail(detail, { taskId: opts.taskId, phase: "dispatch" });
    }
    // Which machine ends up running the suite is known only after provisioning
    // inside runValidation — captured here so the history row can name it.
    const runMeta: { machine: string | null; remoteTestRef: string | null } = {
      machine: null,
      remoteTestRef: null,
    };
    try {
      // Dispatch can hand over a free slot in the same tick the deadline
      // passes — cancel here rather than start a suite nobody waits for.
      if (opts.deadlineAt !== undefined && Date.now() >= opts.deadlineAt) {
        recordRemoteRunHistory(
          this.config,
          opts,
          startedAt,
          null,
          "cancelled",
          "the caller's deadline passed before the run could start on the Hetzner runner",
        );
        return this.infraFail(
          "the caller's deadline passed before the run could start on the Hetzner runner — " +
            "the run was cancelled (retry once a slot is free)",
          { taskId: opts.taskId, phase: "dispatch" },
        );
      }
      const summary = await this.runValidation(opts, remoteRunPaths(opts.taskId), runMeta);
      recordRemoteRunHistory(
        this.config,
        opts,
        startedAt,
        runMeta.machine,
        classifyRunOutcome(summary),
        summary.detail,
        summary,
      );
      return summary;
    } finally {
      release();
    }
  }

  private async runValidation(
    opts: ValidateOptions,
    paths: RemoteRunPaths,
    /** Set once a runner VM is actually chosen — the history row's machine (#0564). */
    runMeta: { machine: string | null; remoteTestRef?: string | null },
  ): Promise<CheckSummary> {
    const rv = this.config.remoteValidation ?? {};
    const dispatch = { taskId: opts.taskId, phase: "dispatch" as const };
    let remoteTestRef: string | null = null;
    const withScope = (summary: CheckSummary): CheckSummary =>
      remoteTestRef != null ? { ...summary, remoteTestScopeRef: remoteTestRef } : summary;
    if (!rv.enabled) return withScope(this.infraFail("remote validation is disabled", dispatch));
    if (!process.env.HETZNER_API_TOKEN)
      return withScope(this.infraFail("HETZNER_API_TOKEN is not set", dispatch));
    if (!this.keyPath || !existsSync(this.keyPath)) {
      return withScope(
        this.infraFail("REPOOS_REMOTE_SSH_KEY is not set or the key file is missing", dispatch),
      );
    }
    if (!rv.snapshotId)
      return withScope(this.infraFail("remoteValidation.snapshotId is not configured", dispatch));
    if (!rv.sshKeyName)
      return withScope(this.infraFail("remoteValidation.sshKeyName is not configured", dispatch));

    this.activeJobs++;
    this.clearIdleTimer();
    const startedAt = Date.now();
    const emit = (s: string): void => {
      this.appendLog(opts.taskId, s);
      opts.onChunk?.(s);
    };
    emit(`\n── remote validation for #${opts.taskId} @ ${opts.candidateSha.slice(0, 12)} ──\n`);

    let tmp: string | null = null;
    try {
      const host = await this.ensureRunner();
      runMeta.machine = host.ip;
      emit(`[runner ${host.ip} ready in ${Math.round((Date.now() - startedAt) / 1000)}s]\n`);
      this.record(
        { taskId: opts.taskId, host: host.ip, phase: "run" },
        { level: "info", phase: "run", message: `runner ${host.ip} ready` },
      );

      const runScope = opts.changedRef ? `changed:${opts.changedRef}` : "full";
      const runStartedIso = new Date(startedAt).toISOString();
      this.setActiveRunStage(
        {
          taskId: opts.taskId,
          host: host.ip,
          phase: opts.phase ?? "pre-review",
          scope: runScope,
          startedAt: runStartedIso,
          stage: "bundle",
          uploadBytes: null,
          uploadSeconds: null,
        },
        opts.taskId,
      );

      // 1. bundle the candidate tree + 2. upload it, transferring only commits
      //    the host does not already have (#0717).
      tmp = mkdtempSync(join(tmpdir(), "repoos-rvr-"));
      const bundlePath = join(tmp, "candidate.bundle");
      const prepared = await prepareRemoteTestBundle(opts.worktreePath, opts.changedRef, emit);
      remoteTestRef = prepared.remoteTestRef;
      runMeta.remoteTestRef = remoteTestRef;
      const remoteBundle = paths.bundle;
      this.setActiveRunStage(
        {
          taskId: opts.taskId,
          host: host.ip,
          phase: opts.phase ?? "pre-review",
          scope: runScope,
          startedAt: runStartedIso,
          stage: "upload",
          uploadBytes: null,
          uploadSeconds: null,
        },
        opts.taskId,
      );
      const upload = await prepareCandidateUpload(this.exec, {
        host,
        bundlePath,
        remoteBundle,
        worktreePath: opts.worktreePath,
        candidateSha: opts.candidateSha,
        changedRef: opts.changedRef,
        changedBaseSha: prepared.changedBaseSha,
        mirrorPath: remoteMirrorPath(this.config.root),
        emit,
      });
      if (!upload.ok) {
        const what =
          upload.stage === "bundle"
            ? `git bundle failed: ${upload.detail}`
            : `upload of candidate bundle failed: ${upload.detail}`;
        return withScope(this.infraFail(what, { taskId: opts.taskId, host: host.ip }));
      }
      emit(
        `[uploaded bundle ${formatBytes(upload.bundleBytes)}${upload.partial ? ` (only new commits since ${upload.baseSha?.slice(0, 12)})` : " (full history — host had no usable base)"} in ${upload.uploadSecs}s]\n`,
      );
      this.record(
        { taskId: opts.taskId, host: host.ip, phase: "run" },
        {
          level: "info",
          phase: "run",
          message: `uploaded bundle ${formatBytes(upload.bundleBytes)} in ${upload.uploadSecs}s${upload.partial ? " (incremental)" : " (full)"}`,
        },
      );
      const uploadSeconds = Math.round(upload.uploadSecs);
      this.setActiveRunStage(
        {
          taskId: opts.taskId,
          host: host.ip,
          phase: opts.phase ?? "pre-review",
          scope: runScope,
          startedAt: runStartedIso,
          stage: "run",
          uploadBytes: upload.bundleBytes,
          uploadSeconds,
        },
        opts.taskId,
      );

      // Provisioning + bundling can outlast the caller's deadline (#0521 spec
      // item 5) — never start a suite for a caller that already gave up. The
      // `cancelled` marker tells the history row apart from a real gate
      // failure (0564 review: this used to land as `fail`).
      if (opts.deadlineAt !== undefined && Date.now() >= opts.deadlineAt) {
        return withScope({
          ...this.infraFail(
            `the caller's deadline passed before the run could start on ${host.ip} — the run was cancelled`,
            { taskId: opts.taskId, host: host.ip, phase: "dispatch" },
          ),
          cancelled: true,
        });
      }

      // 3. run build + test inside the container
      const changedNote = remoteTestRef ? ` (tests scoped to changed vs ${remoteTestRef})` : "";
      emit(`[running build + test on ${host.ip}${changedNote}]\n`);
      this.record(
        { taskId: opts.taskId, host: host.ip, phase: "run" },
        {
          level: "info",
          phase: "run",
          message: `running build + test on ${host.ip}${changedNote}`,
        },
      );
      const cmd = validateScriptArgs(
        remoteBundle,
        opts.candidateSha,
        paths.artifacts,
        remoteTestRef ?? undefined,
        upload.mirrorPath || undefined,
      );
      const run = await this.exec.runRemote(host, cmd, emit, this.timings.remoteRunTimeoutMs);

      // 4. pull artifacts (best effort)
      await this.exec.downloadDir(
        host,
        `${paths.artifacts}/*`,
        join(this.config.root, ".repoos", "logs", "remote-validation", opts.taskId),
      );

      const elapsed = Math.round((Date.now() - startedAt) / 1000);
      if (run.timedOut) {
        emit(
          `\n[remote run SIGKILLed after ${Math.round(this.timings.remoteRunTimeoutMs / 60000)}m]\n`,
        );
        this.logger?.integration(
          opts.taskId,
          "warn",
          `remote validation timed out after ${elapsed}s`,
        );
        const detail = `remote validation timed out after ${elapsed}s (the runner VM may be overloaded) — retrying resumes from the check step`;
        this.record(
          { taskId: opts.taskId, host: host.ip, phase: "result" },
          {
            level: "warn",
            phase: "result",
            message: detail,
            host: host.ip,
            exitCode: null,
            infra: true,
          },
        );
        return withScope({
          ok: false,
          stage: "check",
          transient: true,
          exitCode: null,
          output: tail(run.output, 40, 4000),
          detail,
        });
      }
      if (run.code === 0) {
        emit(`\n[remote validation PASSED in ${elapsed}s]\n`);
        this.logger?.integration(opts.taskId, "info", `remote validation passed in ${elapsed}s`);
        this.record(
          { taskId: opts.taskId, host: host.ip, phase: "result" },
          {
            level: "info",
            phase: "result",
            message: `remote validation passed in ${elapsed}s on ${host.ip}`,
            host: host.ip,
            exitCode: 0,
          },
        );
        return withScope({ ok: true, stage: "check" });
      }

      // Non-zero: the ssh transport itself could have dropped (code 255) — treat
      // that as infra, not a real test failure.
      if (
        run.code === 255 &&
        /(?:Connection|ssh:|closed by remote host|Broken pipe)/i.test(run.output)
      ) {
        return withScope(
          this.infraFail(`ssh connection to the runner dropped mid-run: ${tail(run.output)}`, {
            taskId: opts.taskId,
            host: host.ip,
            exitCode: 255,
          }),
        );
      }
      const transient = looksTransient(run.output);
      emit(`\n[remote validation FAILED (exit ${run.code}) in ${elapsed}s]\n`);
      this.logger?.integration(opts.taskId, "warn", `remote validation failed (exit ${run.code})`, {
        transient,
      });
      this.record(
        { taskId: opts.taskId, host: host.ip, phase: "result" },
        {
          level: transient ? "warn" : "error",
          phase: "result",
          message: `remote validation failed (exit ${run.code}) on ${host.ip}`,
          host: host.ip,
          exitCode: run.code,
          infra: transient,
        },
      );
      return withScope({
        ok: false,
        stage: "check",
        exitCode: run.code,
        transient,
        output: tail(run.output, 40, 4000),
        detail: `remote validation failed (exit ${run.code}) — ${tail(run.output)}`,
      });
    } catch (e) {
      return withScope(this.infraFail((e as Error).message, { taskId: opts.taskId }));
    } finally {
      if (tmp) rmSync(tmp, { recursive: true, force: true });
      this.setActiveRunStage(null, opts.taskId);
      this.activeJobs = Math.max(0, this.activeJobs - 1);
      if (this.activeJobs === 0) this.armIdleTimer();
    }
  }

  // ── VM lifecycle ──────────────────────────────────────────────────────────

  /** Reuse a warm VM, or provision one. Serialised: never creates two. */
  private async ensureRunner(): Promise<RemoteHost> {
    if (this.provisioning) return this.provisioning;
    this.provisioning = this.doEnsureRunner().finally(() => {
      this.provisioning = null;
    });
    return this.provisioning;
  }

  private async doEnsureRunner(): Promise<RemoteHost> {
    const rv = this.config.remoteValidation ?? {};

    // Warm reuse: tracked server still running and within its lifetime cap.
    if (this.state) {
      const ageMs = Date.now() - new Date(this.state.createdAt).getTime();
      if (ageMs < this.maxLifetimeMs()) {
        const existing = await this.hetzner.getServer(this.state.serverId).catch(() => null);
        if (existing && existing.status === "running" && existing.ipv4) {
          return { ip: existing.ipv4, user: this.sshUser, keyPath: this.keyPath };
        }
      }
      // Stale/gone/expired — drop it and clean up below.
      await this.hetzner.deleteServer(this.state.serverId).catch(() => undefined);
      this.state = null;
      this.saveState();
    }

    // Single-server invariant: delete any other labelled server before creating.
    await this.deleteLeaked();

    const name = `repoos-ci-${Date.now().toString(36)}`;
    this.logger?.system("info", `provisioning remote validation runner (${rv.serverType})`);
    const server = await this.hetzner.createServer({
      name,
      serverType: rv.serverType ?? "cpx41",
      location: rv.location ?? "hil",
      image: String(rv.snapshotId),
      sshKeyNames: [String(rv.sshKeyName)],
      labels: { [RUNNER_LABEL_KEY]: "1" },
    });

    const ip = await this.waitForRunning(server);
    this.state = { serverId: server.id, ip, createdAt: new Date().toISOString() };
    this.saveState();
    this.armLifetimeTimer();

    const reachable = await this.waitForSsh(ip);
    if (!reachable) {
      await this.hetzner.deleteServer(server.id).catch(() => undefined);
      this.state = null;
      this.saveState();
      if (this.lifetimeTimer) clearTimeout(this.lifetimeTimer);
      throw new Error(
        `runner ${ip} never accepted SSH within ${this.timings.sshWaitTimeoutMs / 1000}s`,
      );
    }
    return { ip, user: this.sshUser, keyPath: this.keyPath };
  }

  private async waitForRunning(server: HetznerServer): Promise<string> {
    const deadline = Date.now() + this.timings.provisionTimeoutMs;
    let current = server;
    while (Date.now() < deadline) {
      if (current.status === "running" && current.ipv4) return current.ipv4;
      await new Promise((r) => setTimeout(r, this.timings.provisionPollMs));
      const next = await this.hetzner.getServer(server.id);
      if (!next) throw new Error(`runner ${server.id} vanished during provisioning`);
      current = next;
    }
    // Give up: delete the half-born server so it never leaks.
    await this.hetzner.deleteServer(server.id).catch(() => undefined);
    this.state = null;
    this.saveState();
    throw new Error(
      `runner ${server.id} did not reach "running" within ${this.timings.provisionTimeoutMs / 1000}s`,
    );
  }

  private async waitForSsh(ip: string): Promise<boolean> {
    const deadline = Date.now() + this.timings.sshWaitTimeoutMs;
    while (Date.now() < deadline) {
      if (await this.exec.probeTcp(ip, SSH_PORT, 5_000)) return true;
      await new Promise((r) => setTimeout(r, this.timings.sshProbeIntervalMs));
    }
    return false;
  }

  /** Delete every labelled runner VM except the one we currently track. */
  private async deleteLeaked(): Promise<void> {
    let servers: HetznerServer[];
    try {
      servers = await this.hetzner.listServers(RUNNER_LABEL_SELECTOR);
    } catch {
      return; // API list failed — nothing safe to do here
    }
    for (const s of servers) {
      if (this.state && s.id === this.state.serverId) continue;
      await this.hetzner.deleteServer(s.id).catch(() => undefined);
      this.logger?.system("info", `deleted leaked remote validation runner ${s.id} (${s.name})`);
    }
  }

  async reconcile(): Promise<void> {
    // Called at boot: nothing is validating, so every labelled server is a leak.
    this.state = null;
    let servers: HetznerServer[];
    try {
      servers = await this.hetzner.listServers(RUNNER_LABEL_SELECTOR);
    } catch (e) {
      this.logger?.system("warn", `remote runner reconcile skipped: ${(e as Error).message}`);
      return;
    }
    for (const s of servers) {
      await this.hetzner.deleteServer(s.id).catch(() => undefined);
      this.logger?.system(
        "info",
        `reconcile: deleted stray remote validation runner ${s.id} (${s.name})`,
      );
    }
    this.saveState();
  }

  async dispose(): Promise<void> {
    this.clearIdleTimer();
    if (this.lifetimeTimer) clearTimeout(this.lifetimeTimer);
    // An adopted VM belongs to whoever provisioned it; only clear our timers.
    if (this.state && this.state.serverId === this.adoptedServerId) return;
    if (this.state) {
      await this.hetzner.deleteServer(this.state.serverId).catch(() => undefined);
      this.state = null;
      this.saveState();
    }
  }

  private armIdleTimer(): void {
    this.clearIdleTimer();
    if (!this.state) return;
    this.idleTimer = setTimeout(() => {
      void this.teardown("idle");
    }, this.idleMs());
    this.idleTimer.unref?.();
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private armLifetimeTimer(): void {
    if (this.lifetimeTimer) clearTimeout(this.lifetimeTimer);
    this.lifetimeTimer = setTimeout(() => {
      void this.teardown("lifetime cap");
    }, this.maxLifetimeMs());
    this.lifetimeTimer.unref?.();
  }

  private async teardown(why: string): Promise<void> {
    if (!this.state) return;
    if (why === "idle" && this.activeJobs > 0) {
      this.armIdleTimer();
      return;
    }
    const id = this.state.serverId;
    this.state = null;
    this.saveState();
    this.clearIdleTimer();
    if (this.lifetimeTimer) clearTimeout(this.lifetimeTimer);
    await this.hetzner.deleteServer(id).catch(() => undefined);
    this.logger?.system("info", `remote validation runner ${id} deleted (${why})`);
  }
}

// ── Tailscale runner ─────────────────────────────────────────────────────────

/** No configured host provides a required capability (or none are configured). */
export class NoEligibleHostError extends Error {}
/** Every eligible host failed its prerequisite/reachability probe. */
export class HostsUnavailableError extends Error {}

/** A leased host slot: release() hands it to the next compatible waiter. */
export interface HostSlot {
  host: RemoteValidationHost;
  ssh: RemoteHost;
  /** Effective per-host cap in THIS process (the host lock enforces it across processes). */
  limit: number;
  release(): void;
}

interface PoolHostState {
  spec: RemoteValidationHost;
  ssh: RemoteHost;
  limit: number;
  active: number;
  /** Runs in flight right now, oldest first (#0564) — task id + start time. */
  activeRuns: ActiveRemoteRun[];
  /** Dropped from config; kept only until in-flight slots release. */
  removed?: boolean;
  probed: boolean;
  healthy: boolean;
  detail?: string;
  /** Earliest time a probe retry may run. */
  retryAt: number;
  /** Consecutive probe failures, capped so retries can't loop forever. */
  healthFails: number;
  probing?: Promise<void>;
  retryTimer?: ReturnType<typeof setTimeout>;
  lastRun?: { taskId: string; ok: boolean; at: string; durationMs?: number };
  serverStats?: RemoteServerStats;
  statsRequestedAt?: number;
  statsSampling?: Promise<void>;
  hostLock?: HostLockSnapshot;
  hostLockRequestedAt?: number;
  hostLockSampling?: Promise<void>;
}

/** One in-flight remote run, attributed to the host executing it (#0564). */
export interface ActiveRemoteRun {
  taskId: string;
  startedAt: string;
}

interface PoolWaiter {
  capabilities: string[];
  /**
   * Hosts this waiter must never be assigned — failover already tried them
   * this run (#0632). Enforced by dispatch() so a queued retry can't be
   * handed the very host that just failed it.
   */
  excludeHosts?: ReadonlySet<string>;
  resolve: (slot: HostSlot) => void;
  reject: (err: Error) => void;
  onQueue?: (info: { ahead: number; host: string }) => void;
  /** Which run is waiting — surfaced as the queue's next-up tasks (#0564). */
  taskId?: string;
  timer?: ReturnType<typeof setTimeout>;
}

/** How long an unhealthy host waits before a probe may retry it. */
const HEALTH_RETRY_MS = 30_000;

/** Actionable hint when SSH cannot reach a tailnet host (#0683). */
function formatProbeReachabilityDetail(detail: string): string {
  const lower = detail.toLowerCase();
  if (
    lower.includes("connection timed out") ||
    lower.includes("connection refused") ||
    lower.includes("no route to host") ||
    lower.includes("network is unreachable")
  ) {
    return `${detail} — host unreachable: is Tailscale connected and logged in on that machine?`;
  }
  if (lower.includes("tailscale") && (lower.includes("login") || lower.includes("logged out"))) {
    return `${detail} — host unreachable: Tailscale login may have expired on that machine`;
  }
  return detail;
}
const SERVER_STATS_REFRESH_MS = 15_000;
const SERVER_STATS_TIMEOUT_MS = 5_000;
const HOST_LOCK_REFRESH_MS = 3_000;
const HOST_LOCK_INSPECT_TIMEOUT_MS = 4_000;
/**
 * Consecutive failed probes before a host stops being retried. Hitting the cap
 * must not strand queued runs: callers with no `deadlineAt` of their own
 * (release, and close-out when `closeOut.timeoutMs = 0`) would otherwise leave
 * a waiter behind by the stopped retry chain awaiting a slot forever (#0521
 * review). {@link TailscaleHostPool.settleHopelessWaiters} rejects waiters
 * whose eligible hosts have ALL hit this cap.
 */
const MAX_HEALTH_RETRIES = 10;

const SERVER_STATS_COMMAND =
  "printf '__UPTIME__\\n'; uptime 2>/dev/null || true; " +
  "printf '\\n__CPU__\\n'; (getconf _NPROCESSORS_ONLN 2>/dev/null || nproc 2>/dev/null || " +
  "sysctl -n hw.ncpu 2>/dev/null) || true; " +
  "printf '\\n__MEMORY__\\n'; " +
  "if command -v free >/dev/null 2>&1; then free -b; " +
  "else vm_stat 2>/dev/null || true; printf '\\n'; " +
  "sysctl -n hw.pagesize 2>/dev/null || true; " +
  "sysctl -n hw.memsize 2>/dev/null || true; fi; " +
  "printf '\\n__DISK__\\n'; df -Pk \"$HOME\" 2>/dev/null || true";

/** Parse the portable, labelled output of SERVER_STATS_COMMAND. */
export function parseRemoteServerStats(
  output: string,
  sampledAt = new Date().toISOString(),
): RemoteServerStats {
  const sections = new Map<string, string>();
  const marker = /(?:^|\n)__([A-Z_]+)__\n/g;
  let current = "";
  let previous = 0;
  for (const match of output.matchAll(marker)) {
    if (current) sections.set(current, output.slice(previous, match.index).trim());
    current = match[1]!;
    previous = match.index! + match[0].length;
  }
  if (current) sections.set(current, output.slice(previous).trim());

  const stats: RemoteServerStats = { available: false, sampledAt };
  const loadText = sections.get("UPTIME") ?? "";
  const loadMatch = loadText.match(/load averages?:\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (loadMatch) {
    stats.loadAverage = [Number(loadMatch[1]), Number(loadMatch[2]), Number(loadMatch[3])];
  }

  const cpu = Number((sections.get("CPU") ?? "").match(/\d+/)?.[0]);
  if (Number.isSafeInteger(cpu) && cpu > 0) stats.cpuCount = cpu;

  const memory = sections.get("MEMORY") ?? "";
  const freeMemory = memory.match(/^\s*Mem:\s+(\d+)\s+(\d+)/m);
  if (freeMemory) {
    stats.memoryTotalBytes = Number(freeMemory[1]);
    stats.memoryUsedBytes = Number(freeMemory[2]);
  } else {
    const pageSize = Number(memory.match(/(?:^|\n)(\d+)\s*(?:\n|$)/)?.[1]);
    const totalBytes = Number(memory.match(/(?:^|\n)(\d{7,})\s*(?:\n|$)/)?.[1]);
    const pageCount = (label: string): number =>
      Number(memory.match(new RegExp(`Pages ${label}:\\s*(\\d+)`))?.[1] ?? 0);
    if (pageSize > 0 && totalBytes > 0) {
      const availablePages = pageCount("free") + pageCount("inactive") + pageCount("speculative");
      stats.memoryTotalBytes = totalBytes;
      stats.memoryUsedBytes = Math.max(0, totalBytes - availablePages * pageSize);
    }
  }

  const diskLines = (sections.get("DISK") ?? "").split("\n").slice(1);
  for (const line of diskLines) {
    const columns = line.trim().split(/\s+/);
    if (columns.length >= 6 && /^\d+$/.test(columns[3]!)) {
      stats.diskFreeBytes = Number(columns[3]) * 1024;
      break;
    }
  }

  stats.available = Boolean(
    stats.loadAverage || stats.cpuCount || stats.memoryTotalBytes || stats.diskFreeBytes,
  );
  if (!stats.available) stats.detail = "No server statistics could be parsed.";
  return stats;
}

/**
 * Dispatches remote validation jobs across a pool of tailnet hosts (#0521).
 *
 * - Each host carries its own FIFO cap (`maxConcurrent` per host → global → 1),
 *   so two jobs run on two hosts while a third queues.
 * - A job only ever goes to a host providing its capabilities (`runsOn`); if
 *   none does it fails immediately with the mismatch spelled out.
 * - Every host is probed once before its first job (docker/toolchain +
 *   an up-to-date `validate.sh`); a failing host is skipped and re-probed later,
 *   so one dead box doesn't fail jobs while others are idle. Probe retries are
 *   capped — once every eligible host hits the cap, queued runs fail transiently
 *   instead of waiting forever (close-out passes its pipeline deadline when
 *   `closeOut.timeoutMs` is non-zero — #0573; release and a disabled budget
 *   still pass none).
 * - Queue waits honour the caller's deadline: a job that can't start in time
 *   is cancelled and its slot released, and a run that reaches its host after
 *   the deadline cancels instead of starting.
 *
 * The in-process cap covers one server process; the host-side lock inside the
 * remote command (`hostLockShell`) enforces the same cap across processes.
 */
export class TailscaleHostPool {
  private readonly hosts: PoolHostState[] = [];
  private readonly waiters: PoolWaiter[] = [];
  private readonly exec: RemoteExecDeps;
  private readonly probeTimeoutMs: number;
  private readonly healthRetryMs: number;
  private readonly backgroundProbeIntervalMs: number;
  private readonly keyPath?: string;
  private readonly logger?: Logger;
  /** The image every host's Docker prerequisite probe must find (#0521 review). */
  private containerImage: string;
  private backgroundProbeTimer?: ReturnType<typeof setInterval>;

  constructor(rv: RemoteValidationConfig | undefined, opts: HostPoolOptions) {
    this.exec = opts.exec;
    this.logger = opts.logger;
    this.probeTimeoutMs = opts.probeTimeoutMs ?? 20_000;
    this.healthRetryMs = opts.healthRetryMs ?? HEALTH_RETRY_MS;
    this.backgroundProbeIntervalMs =
      opts.backgroundProbeIntervalMs ?? DEFAULT_TIMINGS.backgroundProbeIntervalMs;
    this.containerImage = rv?.containerImage ?? "repoos-ci";
    const key = opts.keyPath ?? "";
    this.keyPath = key && existsSync(key) ? key : undefined;
    for (const spec of resolveRemoteHosts(rv)) {
      this.hosts.push({
        spec,
        ssh: { ip: spec.host, user: rv ? remoteHostUser(rv, spec) : "root", keyPath: this.keyPath },
        limit: rv ? remoteHostLimit(rv, spec) : 1,
        active: 0,
        activeRuns: [],
        probed: false,
        healthy: false,
        retryAt: 0,
        healthFails: 0,
      });
    }
  }

  /**
   * Apply a live `[remoteValidation]` change without replacing the pool
   * object (in-flight `HostSlot.release()` closures stay valid). Hosts still
   * in the list keep in-flight / health / last-run; new hosts are added
   * unprobed; removed hosts stop receiving work and drop once idle.
   */
  sync(rv: RemoteValidationConfig | undefined): void {
    const nextContainerImage = rv?.containerImage ?? "repoos-ci";
    const imageChanged = this.containerImage !== nextContainerImage;
    this.containerImage = nextContainerImage;
    const wanted = resolveRemoteHosts(rv);
    const wantedByHost = new Map(wanted.map((h) => [h.host, h]));

    for (const spec of wanted) {
      const existing = this.hosts.find((s) => s.spec.host === spec.host);
      if (!existing) {
        this.hosts.push({
          spec,
          ssh: {
            ip: spec.host,
            user: rv ? remoteHostUser(rv, spec) : "root",
            keyPath: this.keyPath,
          },
          limit: rv ? remoteHostLimit(rv, spec) : 1,
          active: 0,
          activeRuns: [],
          probed: false,
          healthy: false,
          retryAt: 0,
          healthFails: 0,
        });
        continue;
      }
      const nextUser = rv ? remoteHostUser(rv, spec) : "root";
      const reprobe =
        imageChanged ||
        hostRunner(existing.spec) !== hostRunner(spec) ||
        existing.ssh.user !== nextUser;
      existing.removed = undefined;
      existing.spec = spec;
      existing.ssh = { ip: spec.host, user: nextUser, keyPath: this.keyPath };
      existing.limit = rv ? remoteHostLimit(rv, spec) : 1;
      if (reprobe) {
        existing.probed = false;
        existing.healthy = false;
        existing.healthFails = 0;
        existing.detail = undefined;
        existing.retryAt = 0;
        if (existing.retryTimer) {
          clearTimeout(existing.retryTimer);
          existing.retryTimer = undefined;
        }
      }
    }

    for (let i = this.hosts.length - 1; i >= 0; i--) {
      const s = this.hosts[i]!;
      if (wantedByHost.has(s.spec.host)) continue;
      s.removed = true;
      if (s.active > 0) continue;
      if (s.retryTimer) {
        clearTimeout(s.retryTimer);
        s.retryTimer = undefined;
      }
      this.hosts.splice(i, 1);
    }

    const ordered = wanted
      .map((spec) => this.hosts.find((host) => host.spec.host === spec.host))
      .filter((host): host is PoolHostState => host !== undefined);
    const activeRemoved = this.hosts.filter((host) => host.removed && host.active > 0);
    this.hosts.splice(0, this.hosts.length, ...ordered, ...activeRemoved);

    this.settleIneligibleWaiters();
    if (this.waiters.length) {
      for (const s of this.hosts) {
        if (s.removed || s.probed) continue;
        void this.probe(s).then(() => {
          if (s.healthy) this.dispatch();
          else if (!s.removed && this.waiters.length) this.armHealthRetry(s);
        });
      }
    }
    this.dispatch();
    this.probeDueHosts();
  }

  /**
   * Probe every configured host on server boot and on a timer (#0683), so
   * close-out can dispatch without waiting for the Checks UI tab and
   * `GET /api/remote-validation/status` reflects real health while idle.
   */
  startBackgroundProbing(): void {
    this.probeDueHosts();
    if (this.backgroundProbeTimer || this.backgroundProbeIntervalMs <= 0) return;
    this.backgroundProbeTimer = setInterval(
      () => this.probeDueHosts(),
      this.backgroundProbeIntervalMs,
    );
    this.backgroundProbeTimer.unref?.();
  }

  /** Probe hosts that have never been checked or are due for a health retry. */
  probeDueHosts(): void {
    for (const s of this.liveHosts()) {
      if (s.probing) continue;
      const due =
        !s.probed || (!s.healthy && Date.now() >= s.retryAt && s.healthFails < MAX_HEALTH_RETRIES);
      if (due) void this.probe(s);
    }
  }

  get size(): number {
    return this.hosts.filter((s) => !s.removed).length;
  }

  /** Queued runs, for the status endpoint. */
  get queuedCount(): number {
    return this.waiters.length;
  }

  /**
   * Lease a host providing every capability. Throws {@link NoEligibleHostError}
   * (nobody provides them / no hosts configured), {@link HostsUnavailableError}
   * (all eligible hosts failed their probe, or every one of them is in
   * `excludeHosts`), or {@link QueueDeadlineError} (still queued when
   * `deadlineAt` passed).
   */
  async acquire(
    capabilities: string[],
    opts: {
      /** Fired once this run joins the FIFO queue (#0706: host + position too). */
      onQueue?: (info: { ahead: number; host: string }) => void;
      deadlineAt?: number;
      taskId?: string;
      /**
       * Hosts to skip — failover already tried them this run and they failed
       * transiently (#0632). Guarantees every attempt lands on a distinct
       * host while one remains; throws once all eligible hosts are spent.
       */
      excludeHosts?: readonly string[];
    } = {},
  ): Promise<HostSlot> {
    const excluded = new Set(opts.excludeHosts ?? []);
    const live = this.liveHosts();
    if (live.length === 0) {
      throw new NoEligibleHostError("remoteValidation.tailscaleHost is not configured");
    }
    const eligible = live.filter((s) => hostSatisfies(s.spec, capabilities));
    if (eligible.length === 0) {
      throw new NoEligibleHostError(
        `no remote host provides ${describeCapabilities(capabilities)} ` +
          `(configured: ${live.map((s) => this.describe(s)).join(", ")}) — ` +
          "add a [[remoteValidation.tailscaleHosts]] row whose `os` or `labels` provide it",
      );
    }
    const candidates = eligible.filter((s) => !excluded.has(s.spec.host));
    if (candidates.length === 0) {
      // Every host that could run this job was already tried (and failed
      // transiently) on an earlier attempt (#0632). HostsUnavailableError, not
      // NoEligibleHostError: the hosts DO provide the capabilities — they are
      // merely spent for this run — so the caller's transient/retryable
      // handling applies rather than a config-error gate.
      throw new HostsUnavailableError(
        `every host that can run ${describeCapabilities(capabilities)} was already ` +
          `tried this run (excluded: ${eligible.map((s) => s.spec.host).join(", ")})`,
      );
    }

    // First contact probes; a previously-failed host is re-probed once its
    // cooldown elapsed, so an unreachable host recovers without a restart.
    // Captured first: a candidate STILL inside its cooldown was not probed
    // again below, and its pending retry is what a queued run is waiting on.
    const inCooldown = candidates.some((s) => s.probed && !s.healthy && Date.now() < s.retryAt);
    await Promise.all(
      candidates.map((s) =>
        !s.probed || (!s.healthy && Date.now() >= s.retryAt) ? this.probe(s) : undefined,
      ),
    );

    let healthy = candidates.filter((s) => s.healthy);
    if (healthy.length === 0 && inCooldown) {
      // Nobody is usable and a recovery probe is pending or due: sleep out the
      // same cooldown, re-probe, then decide — wait-vs-fail must not depend on
      // arrival order (#0521 review: a FIRST arrival used to fail instantly
      // while a later one, joining an armed retry, waited for recovery).
      // Bounded by the caller's deadline.
      const cooldown = Math.max(0, Math.min(...candidates.map((s) => s.retryAt)) - Date.now());
      const budget =
        opts.deadlineAt !== undefined ? opts.deadlineAt - Date.now() : Number.POSITIVE_INFINITY;
      if (cooldown > 0) {
        if (budget <= 0) {
          throw new QueueDeadlineError("the caller's deadline passed before any host recovered");
        }
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, Math.min(cooldown, budget));
          t.unref?.();
        });
      }
      if (opts.deadlineAt !== undefined && Date.now() >= opts.deadlineAt) {
        throw new QueueDeadlineError(
          "no usable host when the caller's deadline passed — the run was cancelled",
        );
      }
      // After sleeping for the cooldown we already waited past `retryAt`, so
      // probe every unhealthy candidate regardless of the exact timestamp —
      // skipping the `Date.now() >= s.retryAt` guard here avoids a 1–2 ms
      // timer-resolution race where the setTimeout fires fractionally early and
      // the guard falsely bails, leaving healthy=[]) → HostsUnavailableError.
      await Promise.all(candidates.map((s) => (!s.healthy ? this.probe(s) : undefined)));
      healthy = candidates.filter((s) => s.healthy);
    }
    if (healthy.length === 0) {
      throw new HostsUnavailableError(
        `no usable remote host for ${describeCapabilities(capabilities)} — ` +
          candidates.map((s) => `${s.spec.host}: ${s.detail ?? "unreachable"}`).join("; "),
      );
    }
    await Promise.all(healthy.map((s) => this.refreshHostLockFor(s)));
    const free = healthy.filter((s) => this.hostHasCapacity(s));
    if (free.length > 0) {
      // Somebody already queued may be ahead of this arrival for that slot
      // (#0521 review: e.g. a host recovering while a waiter holds the queue).
      // Dispatch first, then re-check — a late arrival never jumps the queue.
      if (this.waiters.length > 0) this.dispatch();
      const nowFree = healthy
        .filter((s) => this.hostHasCapacity(s))
        .sort(
          (a, b) =>
            this.effectiveActive(a) - this.effectiveActive(b) ||
            this.hosts.indexOf(a) - this.hosts.indexOf(b),
        );
      if (nowFree.length > 0) return this.assign(nowFree[0]!, opts.taskId);
    }

    // Every eligible host is at its cap — queue, FIFO, and only until one of
    // THEM frees (a later-arriving compatible job never jumps the queue).
    return new Promise<HostSlot>((resolve, reject) => {
      const waiter: PoolWaiter = {
        capabilities,
        excludeHosts: excluded,
        resolve,
        reject,
        onQueue: opts.onQueue,
        taskId: opts.taskId,
      };
      this.waiters.push(waiter);
      if (opts.deadlineAt !== undefined) {
        const ms = opts.deadlineAt - Date.now();
        if (ms <= 0) {
          this.waiters.pop();
          reject(new QueueDeadlineError("the caller's deadline passed before a host slot freed"));
          return;
        }
        waiter.timer = setTimeout(() => {
          if (!this.settle(waiter)) return;
          reject(
            new QueueDeadlineError(
              `still queued after ${Math.round(ms / 1000)}s — the caller's deadline passed, ` +
                "so the run was cancelled and its slot released (retry once a host is free)",
            ),
          );
        }, ms);
        waiter.timer.unref?.();
      }
      waiter.onQueue?.({
        ahead: this.queueAheadCount(capabilities, this.waiters.length - 1, excluded),
        host: candidates[0]?.spec.host ?? "",
      });
      // Opportunistic recovery while queued: re-probe dead candidates so the
      // job can move to one the moment it comes back.
      for (const s of candidates) if (!s.healthy) this.armHealthRetry(s);
    });
  }

  /** Mark a host unreachable/misconfigured after a mid-run failure (#0521). */
  markUnhealthy(host: string, detail: string): void {
    const s = this.hosts.find((c) => c.spec.host === host);
    if (!s) return;
    s.probed = true;
    s.healthy = false;
    s.detail = detail;
    s.retryAt = Date.now() + this.healthRetryMs;
    s.healthFails = Math.min(s.healthFails + 1, MAX_HEALTH_RETRIES);
    this.logger?.system("warn", `remote validation host ${host} marked unavailable: ${detail}`);
    if (this.waiters.length) this.armHealthRetry(s);
  }

  /** Record which host ran a job, for the status endpoint (#0521). */
  recordRun(host: string, taskId: string, ok: boolean, durationMs?: number): void {
    const s = this.hosts.find((c) => c.spec.host === host);
    if (s) {
      s.lastRun = { taskId, ok, at: new Date().toISOString(), durationMs };
    }
  }

  /** Per-host state for `/api/remote-validation/status`. */
  status(): RemoteHostStatus[] {
    // Each queued run counts against exactly ONE host — the one dispatch would
    // hand it next (eligible, preferring a healthy host, then least loaded) —
    // so per-host `queued` totals sum to the real queue length instead of
    // counting one waiter once per compatible host (#0521 review).
    const queuedOn = new Map<PoolHostState, { count: number; taskIds: string[] }>();
    for (const w of this.waiters) {
      const next = this.liveHosts()
        .filter(
          (s) =>
            hostSatisfies(s.spec, w.capabilities) && !(w.excludeHosts?.has(s.spec.host) ?? false),
        )
        .sort(
          (a, b) =>
            Number(b.healthy) - Number(a.healthy) ||
            this.effectiveActive(a) - this.effectiveActive(b) ||
            this.hosts.indexOf(a) - this.hosts.indexOf(b),
        )[0];
      if (next) {
        const entry = queuedOn.get(next) ?? { count: 0, taskIds: [] };
        // Every waiter counts toward `queued`; next-up task ids surface only
        // for waiters that carry one (direct pool.acquires may not).
        entry.count++;
        if (w.taskId) entry.taskIds.push(w.taskId);
        queuedOn.set(next, entry);
      }
    }
    return this.hosts.map((s) =>
      mergeHostLockIntoStatus(
        {
          host: s.spec.host,
          user: s.ssh.user,
          os: s.spec.os,
          labels: s.spec.labels ?? [],
          maxConcurrent: s.limit,
          inFlight: s.active,
          queued: queuedOn.get(s)?.count ?? 0,
          probed: s.probed,
          healthy: s.healthy,
          detail: s.detail,
          lastRun: s.lastRun,
          activeRuns: s.activeRuns.map((r) => ({ ...r })),
          queuedTasks: [...(queuedOn.get(s)?.taskIds ?? [])],
          serverStats: s.serverStats ?? { available: false },
        },
        s.hostLock,
      ),
    );
  }

  /** Request stats without acquiring a run slot or entering the run queue. */
  /** Sample host-side lock holders/waiters without taking a run slot (#0705). */
  refreshHostLocks(): void {
    const now = Date.now();
    for (const host of this.liveHosts()) {
      if (
        host.hostLockSampling ||
        (host.hostLockRequestedAt && now - host.hostLockRequestedAt < HOST_LOCK_REFRESH_MS)
      ) {
        continue;
      }
      if (!host.probed || !host.healthy) continue;
      host.hostLockRequestedAt = now;
      host.hostLockSampling = Promise.resolve()
        .then(() =>
          this.exec.runRemote(
            host.ssh,
            hostLockInspectShell(),
            () => {},
            HOST_LOCK_INSPECT_TIMEOUT_MS,
          ),
        )
        .then((result) => {
          const sampledAt = new Date().toISOString();
          if (result.code === 0 && !result.timedOut && result.output.includes("__HOST_LOCK__")) {
            host.hostLock = parseHostLockInspectOutput(result.output, sampledAt);
          }
        })
        .catch(() => {
          /* best effort */
        })
        .finally(() => {
          host.hostLockSampling = undefined;
        });
    }
  }

  refreshServerStats(): void {
    const now = Date.now();
    for (const host of this.liveHosts()) {
      if (
        host.statsSampling ||
        (host.statsRequestedAt && now - host.statsRequestedAt < SERVER_STATS_REFRESH_MS)
      ) {
        continue;
      }
      host.statsRequestedAt = now;
      host.statsSampling = Promise.resolve()
        .then(() =>
          this.exec.runRemote(host.ssh, SERVER_STATS_COMMAND, () => {}, SERVER_STATS_TIMEOUT_MS),
        )
        .then((result) => {
          const sampledAt = new Date().toISOString();
          if (result.code === 0 && !result.timedOut) {
            host.serverStats = parseRemoteServerStats(result.output, sampledAt);
          } else {
            host.serverStats = {
              available: false,
              sampledAt,
              detail: result.timedOut
                ? "Statistics request timed out."
                : "Statistics request failed.",
            };
          }
        })
        .catch((error: unknown) => {
          host.serverStats = {
            available: false,
            sampledAt: new Date().toISOString(),
            detail: error instanceof Error ? error.message : "Statistics request failed.",
          };
        })
        .finally(() => {
          host.statsSampling = undefined;
        });
    }
  }

  /**
   * Shut the pool down: clear timers AND reject every queued waiter (#0521
   * review) — a `validate()` awaiting a slot must fail promptly with a
   * transient infra summary, not hang forever after a restart/dispose.
   */
  dispose(): void {
    if (this.backgroundProbeTimer) {
      clearInterval(this.backgroundProbeTimer);
      this.backgroundProbeTimer = undefined;
    }
    for (const s of this.hosts) {
      if (s.retryTimer) {
        clearTimeout(s.retryTimer);
        s.retryTimer = undefined;
      }
    }
    const waiting = this.waiters.splice(0, this.waiters.length);
    for (const w of waiting) {
      if (w.timer) clearTimeout(w.timer);
      w.reject(new Error("the remote validation pool shut down while this run was queued"));
    }
  }

  private liveHosts(): PoolHostState[] {
    return this.hosts.filter((s) => !s.removed);
  }

  /** Host-side slots in use (standalone + server), for dispatch (#0705). */
  private lockOccupancy(s: PoolHostState): number {
    return s.hostLock?.holders.length ?? 0;
  }

  private effectiveActive(s: PoolHostState): number {
    return Math.max(s.active, this.lockOccupancy(s));
  }

  private hostHasCapacity(s: PoolHostState): boolean {
    return s.healthy && this.effectiveActive(s) < s.limit;
  }

  hostLockFor(host: string): HostLockSnapshot | undefined {
    return this.hosts.find((s) => s.spec.host === host)?.hostLock;
  }

  private async refreshHostLockFor(s: PoolHostState): Promise<void> {
    try {
      const result = await this.exec.runRemote(
        s.ssh,
        hostLockInspectShell(),
        () => {},
        HOST_LOCK_INSPECT_TIMEOUT_MS,
      );
      if (result.code === 0 && !result.timedOut && result.output.includes("__HOST_LOCK__")) {
        s.hostLock = parseHostLockInspectOutput(result.output, new Date().toISOString());
        s.hostLockRequestedAt = Date.now();
      }
    } catch {
      /* best effort */
    }
  }

  /** Hosts that could take a job with these capabilities. */
  private hostsEligibleFor(
    capabilities: string[],
    excludeHosts?: ReadonlySet<string>,
  ): PoolHostState[] {
    return this.liveHosts().filter(
      (s) => hostSatisfies(s.spec, capabilities) && !(excludeHosts?.has(s.spec.host) ?? false),
    );
  }

  /** True when two jobs could be assigned to the same host. */
  private waitersCompete(
    a: { capabilities: string[]; excludeHosts?: ReadonlySet<string> },
    b: { capabilities: string[]; excludeHosts?: ReadonlySet<string> },
  ): boolean {
    const hostsA = new Set(
      this.hostsEligibleFor(a.capabilities, a.excludeHosts).map((s) => s.spec.host),
    );
    return this.hostsEligibleFor(b.capabilities, b.excludeHosts).some((s) =>
      hostsA.has(s.spec.host),
    );
  }

  /**
   * How many runs are ahead of a queued waiter: in-flight on its eligible
   * hosts plus earlier FIFO waiters that compete for the same hosts — not
   * waiters that only need a different host (#0521 review).
   */
  private queueAheadCount(
    capabilities: string[],
    waiterIndex: number,
    excludeHosts?: ReadonlySet<string>,
  ): number {
    const active = this.hostsEligibleFor(capabilities, excludeHosts).reduce(
      (n, s) => n + this.effectiveActive(s),
      0,
    );
    let aheadWaiters = 0;
    for (let i = 0; i < waiterIndex; i++) {
      const w = this.waiters[i]!;
      if (this.waitersCompete(w, { capabilities, excludeHosts })) aheadWaiters++;
    }
    return active + aheadWaiters;
  }

  private dropIfIdle(s: PoolHostState): void {
    if (!s.removed || s.active > 0) return;
    const i = this.hosts.indexOf(s);
    if (i === -1) return;
    if (s.retryTimer) {
      clearTimeout(s.retryTimer);
      s.retryTimer = undefined;
    }
    this.hosts.splice(i, 1);
  }

  private describe(s: PoolHostState): string {
    const caps = [s.spec.os, ...(s.spec.labels ?? [])].filter(Boolean);
    return `${s.spec.host}${caps.length ? ` [${caps.join(", ")}]` : ""}`;
  }

  /** Remove a waiter (timer included); false when it already settled. */
  private settle(w: PoolWaiter): boolean {
    const i = this.waiters.indexOf(w);
    if (i === -1) return false;
    this.waiters.splice(i, 1);
    if (w.timer) clearTimeout(w.timer);
    return true;
  }

  private assign(s: PoolHostState, taskId?: string): HostSlot {
    s.active++;
    // Attribute the run to this host with its start time (#0564): the Remote
    // runners tab shows "#0564 · 2m 10s", and release() removes exactly this
    // entry (a host may run several jobs at once).
    const run: ActiveRemoteRun = { taskId: taskId ?? "?", startedAt: new Date().toISOString() };
    s.activeRuns.push(run);
    let released = false;
    return {
      host: s.spec,
      ssh: s.ssh,
      limit: s.limit,
      release: () => {
        if (released) return;
        released = true;
        s.active = Math.max(0, s.active - 1);
        const i = s.activeRuns.indexOf(run);
        if (i !== -1) s.activeRuns.splice(i, 1);
        this.dropIfIdle(s);
        this.dispatch();
      },
    };
  }

  /** Hand freed slots to the earliest compatible waiter (FIFO, skipping none
   *  that cannot run yet — a macos-only waiter never blocks a linux job). */
  private dispatch(): void {
    for (let i = 0; i < this.waiters.length;) {
      const w = this.waiters[i]!;
      const free = this.liveHosts()
        .filter(
          (s) =>
            this.hostHasCapacity(s) &&
            hostSatisfies(s.spec, w.capabilities) &&
            !(w.excludeHosts?.has(s.spec.host) ?? false),
        )
        .sort(
          (a, b) =>
            this.effectiveActive(a) - this.effectiveActive(b) ||
            this.hosts.indexOf(a) - this.hosts.indexOf(b),
        )[0];
      if (!free) {
        i++;
        continue;
      }
      this.settle(w);
      w.resolve(this.assign(free, w.taskId));
    }
  }

  /** Single-flight prerequisite probe; sets health + detail on the host. */
  private async probe(s: PoolHostState): Promise<void> {
    if (s.probing) return s.probing;
    s.probing = this.doProbe(s)
      .finally(() => {
        s.probing = undefined;
      })
      .then(() => {
        // This probe's result is now final and `probing` no longer masks the
        // host: if it exhausted the retry cap, queued runs waiting only on
        // dead hosts must be settled now (#0521 review — without this they
        // hang forever once the retry chain stops).
        if (!s.healthy && s.healthFails >= MAX_HEALTH_RETRIES) this.settleHopelessWaiters();
      });
    return s.probing;
  }

  private async doProbe(s: PoolHostState): Promise<void> {
    let ok = false;
    let detail = "";
    try {
      const res = await this.exec.runRemote(
        s.ssh,
        prereqProbeCommand(hostRunner(s.spec), this.containerImage),
        () => {},
        this.probeTimeoutMs,
      );
      ok = res.code === 0 && res.output.includes(PREREQ_OK_TOKEN);
      if (!ok) {
        const why = tail(res.output, 5, 600);
        detail = formatProbeReachabilityDetail(
          `prerequisite check failed (exit ${res.code ?? "signal"}): ${why}`,
        );
      }
    } catch (e) {
      detail = formatProbeReachabilityDetail(`prerequisite check failed: ${(e as Error).message}`);
    }
    s.probed = true;
    if (ok) {
      s.healthy = true;
      s.detail = undefined;
      s.healthFails = 0;
      s.retryAt = 0;
      this.logger?.system("info", `remote validation host ${s.spec.host} is ready`);
    } else {
      s.healthy = false;
      s.detail = detail;
      s.healthFails++;
      s.retryAt = Date.now() + this.healthRetryMs;
      this.logger?.system("warn", `remote validation host ${s.spec.host}: ${detail}`);
    }
  }

  /**
   * One more probe for a dead host while somebody is waiting on it. Once the
   * retry cap is hit, no timer will ever fire for this host again — settle any
   * queued run left with no recoverable host at all (#0521 review).
   */
  private armHealthRetry(s: PoolHostState): void {
    if (s.healthy) return;
    if (s.healthFails >= MAX_HEALTH_RETRIES) {
      this.settleHopelessWaiters();
      return;
    }
    if (s.retryTimer) return;
    const delay = Math.max(0, s.retryAt - Date.now());
    s.retryTimer = setTimeout(() => {
      s.retryTimer = undefined;
      if (s.healthy || this.waiters.length === 0) return;
      void this.probe(s).then(() => {
        if (s.healthy) this.dispatch();
        else this.armHealthRetry(s);
      });
    }, delay);
    s.retryTimer.unref?.();
  }

  /**
   * Reject queued runs that can never start (#0521 review): every host
   * eligible for them has exhausted its probe retries, so nothing will ever
   * dispatch them. They fail transiently with {@link HostsUnavailableError} —
   * callers with no deadline of their own (`release.ts`, and close-out in
   * `integration-orchestrator.ts` when `closeOut.timeoutMs = 0`; close-out
   * otherwise passes its pipeline deadline, #0573) would otherwise await a
   * slot forever. A waiter with ANY still-recoverable eligible host — healthy,
   * still inside its retry budget, or mid-probe — stays queued.
   */
  private settleHopelessWaiters(): void {
    for (const w of [...this.waiters]) {
      // Usable = eligible AND not excluded by this waiter (#0632): a queued
      // failover retry can never be served from a host it was told to skip,
      // so exhaustion of its usable hosts settles it even if excluded hosts
      // are still healthy.
      const eligible = this.hostsEligibleFor(w.capabilities, w.excludeHosts);
      const hopeless =
        eligible.length > 0 &&
        eligible.every((s) => !s.healthy && !s.probing && s.healthFails >= MAX_HEALTH_RETRIES);
      if (!hopeless) continue;
      if (!this.settle(w)) continue;
      this.logger?.system(
        "warn",
        `remote validation: cancelling a queued run — every eligible host ` +
          `(${eligible.map((s) => s.spec.host).join(", ")}) exhausted its ` +
          `${MAX_HEALTH_RETRIES} probe retries`,
      );
      w.reject(
        new HostsUnavailableError(
          `no usable remote host for ${describeCapabilities(w.capabilities)} — ` +
            `${eligible.map((s) => `${s.spec.host}: ${s.detail ?? "unreachable"}`).join("; ")} ` +
            `(gave up after ${MAX_HEALTH_RETRIES} failed probes — retry once a host is back)`,
        ),
      );
    }
  }

  /**
   * After a live host-list change, fail waiters that no remaining host can
   * satisfy (same non-retryable error as acquire-time mismatch).
   */
  private settleIneligibleWaiters(): void {
    for (const w of [...this.waiters]) {
      const live = this.liveHosts();
      if (live.length === 0) {
        if (!this.settle(w)) continue;
        w.reject(new NoEligibleHostError("remoteValidation.tailscaleHost is not configured"));
        continue;
      }
      // Exclusions count (#0632): if a queued failover retry's usable hosts
      // were all removed from config, no remaining host can ever serve it —
      // the capability check alone would leave it waiting on a host it must
      // not be assigned.
      if (this.hostsEligibleFor(w.capabilities, w.excludeHosts).length > 0) continue;
      if (!this.settle(w)) continue;
      w.reject(
        new NoEligibleHostError(
          `no remote host provides ${describeCapabilities(w.capabilities)} ` +
            `(configured: ${live.map((s) => this.describe(s)).join(", ")}) — ` +
            "add a [[remoteValidation.tailscaleHosts]] row whose `os` or `labels` provide it",
        ),
      );
    }
  }
}

/** Knobs the pool takes from the runner (tests shrink these). */
export interface HostPoolOptions {
  exec: RemoteExecDeps;
  logger?: Logger;
  /** SSH key path; omitted → SSH default resolution (agent, ~/.ssh/config). */
  keyPath?: string;
  probeTimeoutMs?: number;
  healthRetryMs?: number;
  /** Periodic re-probe of unhealthy hosts; 0 disables the timer (#0683). */
  backgroundProbeIntervalMs?: number;
}

/**
 * The history outcome for a validate() summary (#0564 review): a deadline
 * that passed mid-dispatch marks its summary `cancelled`, and the row must
 * say `cancelled` — the Runs tab exists to tell "the gate was cancelled"
 * apart from "the gate caught something".
 */
function classifyRunOutcome(summary: CheckSummary): "pass" | "fail" | "cancelled" {
  if (summary.ok) return "pass";
  return summary.cancelled ? "cancelled" : "fail";
}

/**
 * Record one remote validation run in the durable check-run history (#0564).
 *
 * One row per `validate()` invocation — dispatch failures included, with a
 * null machine when the run never reached a host. Pseudo task ids ("release",
 * "checks-test-suite") record task-less; their phase tells the story. The
 * scope is 'full' unless the run used changed-path tests (#0695). Fail-soft:
 * history is observability, never a gate input.
 *
 * The store root honours `REPOOS_CHECK_STORE_ROOT` (0564 review): a standalone
 * `repoos check` that dispatches the remote half itself resolves it to the
 * MAIN checkout before dispatching, so the row lands in the history the
 * server reads instead of the worktree's own file. Server-side callers leave
 * the env unset and fall through to `config.root` — the main checkout.
 */
function recordRemoteRunHistory(
  config: RepoOSConfig,
  opts: ValidateOptions,
  startedAt: number,
  machine: string | null,
  outcome: "pass" | "fail" | "cancelled",
  detail?: string | null,
  summary?: CheckSummary,
): void {
  try {
    const storeRoot = process.env.REPOOS_CHECK_STORE_ROOT?.trim() || config.root;
    const meta = summary
      ? remoteRunHistoryMeta(outcome, {
          output: summary.output,
          detail: detail ?? summary.detail,
          transient: summary.transient,
          configError: summary.configError,
          cancelled: summary.cancelled,
        })
      : remoteRunHistoryMeta(outcome, { detail: detail ?? null });
    getCheckStore(storeRoot, config.cacheDir).record({
      taskId: /^\d+$/.test(opts.taskId) ? opts.taskId : null,
      phase: opts.phase ?? "pre-review",
      candidateSha: opts.candidateSha,
      machine,
      remote: true,
      scope:
        summary?.remoteTestScopeRef != null && summary.remoteTestScopeRef !== ""
          ? `changed:${summary.remoteTestScopeRef}`
          : "full",
      startedAt: new Date(startedAt).toISOString(),
      durationMs: outcome === "cancelled" ? null : Math.max(0, Date.now() - startedAt),
      outcome,
      failedStep: meta.failedStep,
      skippedSteps: [],
      detail: detail ?? null,
      failedTests: meta.failedTests,
    });
  } catch {
    /* never fail the gate on a history write */
  }
}

/**
 * Runs the validation gate on one or more persistent machines reachable via
 * Tailscale (#0521). No VM provisioning — the hosts are always there. Each job
 * runs inside a fresh Docker/Podman container (`docker run --rm`, Linux) or
 * natively (macOS `validate.sh`), with a persistent bun-cache for speed.
 *
 * Dispatch goes through {@link TailscaleHostPool}: every eligible host gets its
 * own cap, jobs queue only when all of them are busy, an unreachable or
 * misconfigured host is skipped (and re-probed later) instead of failing jobs,
 * and a job's `runsOn` capabilities decide which hosts may take it. The
 * host-side lock in the remote command enforces the same cap across processes
 * (standalone `repoos check` vs the server), and a queued job cancels itself
 * at the caller's deadline rather than holding its slot.
 */
export class TailscaleRunner implements RemoteValidator {
  private readonly exec: RemoteExecDeps;
  private readonly timings: RunnerTimings;
  private readonly keyPath: string;
  private readonly pool: TailscaleHostPool;
  private readonly activeRunRegistry = new ActiveRemoteRunRegistry();

  constructor(
    private readonly config: RepoOSConfig,
    private readonly logger?: Logger,
    deps?: { exec?: RemoteExecDeps; timings?: Partial<RunnerTimings> },
  ) {
    this.exec = deps?.exec ?? defaultRemoteExec();
    this.timings = { ...DEFAULT_TIMINGS, ...deps?.timings };
    this.keyPath = process.env.REPOOS_REMOTE_SSH_KEY ?? "";
    this.pool = new TailscaleHostPool(config.remoteValidation, {
      exec: this.exec,
      logger,
      keyPath: this.keyPath,
      probeTimeoutMs: this.timings.probeTimeoutMs,
      healthRetryMs: this.timings.healthRetryMs,
      backgroundProbeIntervalMs: this.timings.backgroundProbeIntervalMs,
    });
    if (config.remoteValidation?.enabled) {
      this.pool.startBackgroundProbing();
    }
  }

  logPath(taskId: string): string {
    return join(this.config.root, ".repoos", "logs", "remote-validation", `${taskId}.log`);
  }

  /** Structured events for the Debug tab (#0568). */
  remoteEvents(taskId: string): RemoteValidationEvent[] {
    return readRemoteValidationEvents(this.config.root, taskId);
  }

  private appendLog(taskId: string, text: string): void {
    try {
      const p = this.logPath(taskId);
      mkdirSync(join(this.config.root, ".repoos", "logs", "remote-validation"), {
        recursive: true,
      });
      appendFileSync(p, redactSecrets(text));
    } catch {
      /* best effort */
    }
  }

  /** Append a structured event when a task id is known (best-effort). */
  private record(ctx: RemoteEventContext, event: Omit<RemoteValidationEvent, "at">): void {
    if (!ctx.taskId) return;
    appendRemoteValidationEvent(this.config.root, ctx.taskId, {
      ...event,
      host: event.host ?? ctx.host,
      exitCode: event.exitCode ?? ctx.exitCode,
    });
  }

  private infraFail(detail: string, ctx: RemoteEventContext = {}): CheckSummary {
    this.logger?.system("warn", `remote validation unavailable: ${detail}`);
    this.record(ctx, {
      level: "warn",
      phase: ctx.phase ?? "result",
      message: `remote validation unavailable: ${detail}`,
      infra: true,
    });
    return {
      ok: false,
      stage: "check",
      transient: true,
      detail: `remote validation unavailable: ${detail}`,
    };
  }

  /**
   * Configuration/routing failure → NON-retryable CheckSummary (#0521 review).
   * `NoEligibleHostError` means no configured host provides a capability the
   * job requires — a misconfiguration, not transient infra: retrying cannot
   * fix it, and with `fallbackToLocal = true` a transient summary made the
   * pre-review gate silently run the FULL gate locally instead of failing
   * clearly on the wrong machine. An UNREACHABLE host stays transient
   * (`infraFail`): that genuinely can recover on its own.
   */
  private configFail(detail: string, ctx: RemoteEventContext = {}): CheckSummary {
    this.logger?.system("error", `remote validation cannot run: ${detail}`);
    this.record(ctx, {
      level: "error",
      phase: ctx.phase ?? "dispatch",
      message: `remote validation cannot run: ${detail}`,
      infra: false,
      configError: true,
    });
    return {
      ok: false,
      stage: "check",
      transient: false,
      configError: true,
      detail: `remote validation cannot run: ${detail}`,
    };
  }

  /** Per-host pool state for the status endpoint (#0521). */
  hostStatus(): RemoteHostStatus[] {
    return this.pool.status();
  }

  /** In-flight runs with their current stage, for the slow-run detector (#0720). */
  activeRemoteRuns(): ActiveRemoteRunInfo[] {
    return this.activeRunRegistry.list();
  }

  /**
   * Record/advance the stage of one in-flight remote run. `null` clears the
   * entry when the run finishes (or its host slot is released without a result).
   */
  private setActiveRunStage(info: ActiveRemoteRunInfo | null, taskId: string): void {
    this.activeRunRegistry.set(info, taskId);
  }

  refreshHostStats(): void {
    this.pool.refreshServerStats();
  }

  refreshHostLocks(): void {
    this.pool.refreshHostLocks();
  }

  /**
   * Rebuild the dispatch pool from the (already mutated) config object so a
   * Settings save takes effect without restarting the server (#0521 review).
   */
  applyConfig(): void {
    this.pool.sync(this.config.remoteValidation);
    this.pool.startBackgroundProbing();
  }

  /** The queue line a waiting job streams: what it needs and why it waits. */
  private queueNote(ahead: number, capabilities: string[]): string {
    const need = capabilities.length
      ? `waiting for a host with ${describeCapabilities(capabilities)} — `
      : "";
    return (
      `[queued behind ${ahead} other remote run(s) — ${need}every eligible host is at ` +
      "its per-host limit; starts when a slot frees]\n"
    );
  }

  async validate(opts: ValidateOptions): Promise<CheckSummary> {
    const rv = this.config.remoteValidation ?? {};
    const startedAt = Date.now();
    const dispatch = { taskId: opts.taskId, phase: "dispatch" as const };
    if (!rv.enabled) {
      // The Hetzner runner records an infra row for this same condition
      // (validate() falls through to runValidation, which fails on the
      // disabled config) — record one here too, with no machine, instead of
      // returning before anything is written (0564 review: keep the two
      // providers consistent so a dispatch attempt never vanishes).
      recordRemoteRunHistory(
        this.config,
        opts,
        startedAt,
        null,
        "fail",
        "remote validation is disabled",
      );
      return this.infraFail("remote validation is disabled", dispatch);
    }
    const capabilities = (opts.capabilities ?? []).map((c) => c.trim()).filter(Boolean);
    const emit = (s: string): void => {
      this.appendLog(opts.taskId, s);
      opts.onChunk?.(s);
    };

    // Dispatch: an idle eligible host, or a FIFO queue that respects the
    // caller's deadline. Pool failures split two ways (#0521 review): a
    // MISCONFIGURATION (no host provides what the job needs) is non-retryable
    // so `fallbackToLocal` can't swallow it; a dead host or an expired deadline
    // is transient infra — never a red gate.
    const hostCount = resolveRemoteHosts(rv).length;
    const retryEnabled =
      rv.retryOtherHosts === true && rv.provider === "tailscale" && hostCount >= 2;
    // One attempt per configured host: acquire() excludes every host this run
    // already tried (#0632), so each iteration leases a host that has not run
    // yet, and the pool's HostsUnavailableError ends the loop early when the
    // capability-eligible pool is smaller than the configured one.
    const maxAttempts = retryEnabled ? Math.max(1, hostCount) : 1;
    const triedHosts = new Set<string>();
    let lastSummary: CheckSummary | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let slot: HostSlot;
      try {
        slot = await this.pool.acquire(capabilities, {
          taskId: opts.taskId,
          deadlineAt: opts.deadlineAt,
          // Failover guarantee: the pool never hands back a host this run
          // already tried, so a retry cannot re-run the failed host.
          excludeHosts: [...triedHosts],
          onQueue: ({ ahead }) => {
            const note = this.queueNote(ahead, capabilities);
            emit(note);
            appendRemoteValidationEvent(this.config.root, opts.taskId, {
              level: "info",
              phase: "queued",
              message: note.trim(),
            });
          },
        });
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        emit(`[remote validation not started: ${detail}]\n`);
        const outcome = e instanceof QueueDeadlineError ? "cancelled" : "fail";
        if (lastSummary) {
          // A retry could not start — every other eligible host is spent
          // (HostsUnavailableError), unreachable, or the caller's deadline
          // expired while the retry queued. Deliberate (#0632 review): the
          // run's result stays the last attempt's real summary — a transient
          // failure the caller's fallback/retryable handling understands —
          // rather than a fresh synthesized infra error discarding what
          // actually happened. The failed dispatch still gets its history row.
          recordRemoteRunHistory(this.config, opts, startedAt, null, outcome, detail);
          appendRemoteValidationEvent(this.config.root, opts.taskId, {
            level: "warn",
            phase: "dispatch",
            message: detail,
          });
          return lastSummary;
        }
        recordRemoteRunHistory(this.config, opts, startedAt, null, outcome, detail);
        if (e instanceof NoEligibleHostError) return this.configFail(detail, dispatch);
        return this.infraFail(detail, dispatch);
      }

      try {
        // The pool's exclusion guarantees a host this run has not tried yet.
        triedHosts.add(slot.host.host);
        const summary = await this.runValidation(opts, slot, capabilities);
        recordRemoteRunHistory(
          this.config,
          opts,
          startedAt,
          slot.host.host,
          classifyRunOutcome(summary),
          summary.detail,
          summary,
        );
        lastSummary = summary;
        // Retry only on a transient failure with untried hosts left, and never
        // after a deadline cancellation — the caller has no time budget for
        // another host anyway. Non-transient results (a real red gate,
        // configError) are the branch's fault, not infra, and never retry.
        if (
          !summary.ok &&
          summary.transient &&
          !summary.cancelled &&
          retryEnabled &&
          triedHosts.size < maxAttempts
        ) {
          emit(
            `\n[retrying remote validation on another host — ${slot.host.host} failed transiently]\n`,
          );
          appendRemoteValidationEvent(this.config.root, opts.taskId, {
            level: "warn",
            phase: "run",
            message: `retrying on another host after transient failure on ${slot.host.host}`,
            host: slot.host.host,
          });
          continue; // the slot releases in `finally`
        }
        return summary;
      } finally {
        // Try to release; the guard inside release() prevents double-release.
        try {
          slot.release();
        } catch {
          /* best effort */
        }
      }
    }
    // Unreachable while exclusion holds (the final attempt always returns) —
    // kept as a backstop so the loop can never fall through without a result.
    return (
      lastSummary ??
      this.infraFail("remote validation retry loop exhausted", {
        taskId: opts.taskId,
        phase: "result",
      })
    );
  }

  private async runValidation(
    opts: ValidateOptions,
    slot: HostSlot,
    capabilities: string[],
  ): Promise<CheckSummary> {
    const rv = this.config.remoteValidation ?? {};
    const host = slot.ssh;
    const paths = remoteRunPaths(opts.taskId);
    const startedAt = Date.now();
    let remoteTestRef: string | null = null;
    const withScope = (summary: CheckSummary): CheckSummary =>
      remoteTestRef != null ? { ...summary, remoteTestScopeRef: remoteTestRef } : summary;
    const emit = (s: string): void => {
      this.appendLog(opts.taskId, s);
      opts.onChunk?.(s);
    };
    emit(
      `\n── remote validation (tailscale) for #${opts.taskId} @ ${opts.candidateSha.slice(0, 12)} ──\n`,
    );
    // Which host ran this job — the record the per-task log keeps (#0521).
    const runnerNote =
      `[runner ${host.user}@${host.ip}${slot.host.os ? ` (${slot.host.os})` : ""}]` +
      `${capabilities.length ? ` [requires ${describeCapabilities(capabilities)}]` : ""}\n`;
    emit(runnerNote);
    this.record(
      { taskId: opts.taskId, host: host.ip, phase: "run" },
      { level: "info", phase: "run", message: runnerNote.trim(), host: host.ip },
    );

    let tmp: string | null = null;
    // Register this run so the slow-run detector (#0720) can watch its stage
    // and elapsed time while it is still in flight.
    const runScope = opts.changedRef ? `changed:${opts.changedRef}` : "full";
    this.setActiveRunStage(
      {
        taskId: opts.taskId,
        host: host.ip,
        phase: opts.phase ?? "pre-review",
        scope: runScope,
        startedAt: new Date(startedAt).toISOString(),
        stage: "bundle",
        uploadBytes: null,
        uploadSeconds: null,
      },
      opts.taskId,
    );
    try {
      // 1. bundle the candidate tree + 2. upload it, transferring only commits
      //    the host does not already have (#0717). A persistent bare mirror on
      //    the host holds the last candidate, so a normal run ships a few KB
      //    instead of the full ~100 MB history.
      tmp = mkdtempSync(join(tmpdir(), "repoos-rvr-"));
      const bundlePath = join(tmp, "candidate.bundle");
      const prepared = await prepareRemoteTestBundle(opts.worktreePath, opts.changedRef, emit);
      remoteTestRef = prepared.remoteTestRef;
      const remoteBundle = paths.bundle;
      this.setActiveRunStage(
        {
          taskId: opts.taskId,
          host: host.ip,
          phase: opts.phase ?? "pre-review",
          scope: runScope,
          startedAt: new Date(startedAt).toISOString(),
          stage: "upload",
          uploadBytes: null,
          uploadSeconds: null,
        },
        opts.taskId,
      );
      const upload = await prepareCandidateUpload(this.exec, {
        host,
        bundlePath,
        remoteBundle,
        worktreePath: opts.worktreePath,
        candidateSha: opts.candidateSha,
        changedRef: opts.changedRef,
        changedBaseSha: prepared.changedBaseSha,
        mirrorPath: remoteMirrorPath(this.config.root),
        emit,
      });
      if (!upload.ok) {
        const detail =
          upload.stage === "bundle"
            ? `git bundle failed: ${upload.detail}`
            : `ssh upload of candidate bundle to ${host.ip} failed: ${upload.detail}`;
        // Upload uses the SSH transport too. A failed transfer means this host
        // may have gone away since its prerequisite probe; keep queued work
        // from immediately selecting it again until the health retry probe.
        if (upload.hostGone) {
          this.pool.markUnhealthy(host.ip, detail);
          this.pool.recordRun(host.ip, opts.taskId, false, Date.now() - startedAt);
        }
        return withScope(this.infraFail(detail, { taskId: opts.taskId, host: host.ip }));
      }
      emit(
        `[uploaded bundle ${formatBytes(upload.bundleBytes)}${upload.partial ? ` (only new commits since ${upload.baseSha?.slice(0, 12)})` : " (full history — host had no usable base)"} in ${upload.uploadSecs}s]\n`,
      );
      this.record(
        { taskId: opts.taskId, host: host.ip, phase: "run" },
        {
          level: "info",
          phase: "run",
          message: `uploaded bundle ${formatBytes(upload.bundleBytes)} in ${upload.uploadSecs}s${upload.partial ? " (incremental)" : " (full)"}`,
        },
      );
      const uploadSeconds = Math.round(upload.uploadSecs);
      // The upload is done — from here the run waits for the host lock and then
      // executes the suite, so the slow-run detector stops blaming the transfer.
      this.setActiveRunStage(
        {
          taskId: opts.taskId,
          host: host.ip,
          phase: opts.phase ?? "pre-review",
          scope: runScope,
          startedAt: new Date(startedAt).toISOString(),
          stage: "queue",
          uploadBytes: upload.bundleBytes,
          uploadSeconds,
        },
        opts.taskId,
      );

      // 3. run build + test via validate.sh on the host (which calls docker run
      //    itself), wrapped in the host-side slot lock so this process's gate
      //    and every other repoos process share ONE per-host limit (#0521).
      const image = rv.containerImage ?? "repoos-ci";
      // Never enter the host lock after the caller's deadline (#0521 spec
      // item 5): a run whose caller already gave up (dispatch can win the race
      // with the queue timer, or the deadline passes during bundle/upload) must
      // not start a suite or hold a slot — cancel transiently, like a queued
      // run. The `cancelled` marker keeps the history row from reading as a
      // gate failure (0564 review).
      if (opts.deadlineAt !== undefined && Date.now() >= opts.deadlineAt) {
        return withScope({
          ...this.infraFail(
            `the caller's deadline passed before the run could start on ${host.ip} — the run was cancelled`,
            { taskId: opts.taskId, host: host.ip, phase: "dispatch" },
          ),
          cancelled: true,
        });
      }
      const changedNote = remoteTestRef ? ` (tests scoped to changed vs ${remoteTestRef})` : "";
      emit(`[running build + test in ${image} on ${host.ip}${changedNote}]\n`);
      this.record(
        { taskId: opts.taskId, host: host.ip, phase: "run" },
        {
          level: "info",
          phase: "run",
          message: `running build + test in ${image} on ${host.ip}${changedNote}`,
        },
      );
      const inner = `REPOOS_CI_IMAGE=${shellQuote(image)} ${validateScriptArgs(
        remoteBundle,
        opts.candidateSha,
        paths.artifacts,
        remoteTestRef ?? undefined,
        upload.mirrorPath || undefined,
      )}`;
      const waitSecs =
        opts.deadlineAt !== undefined
          ? deadlineLockWaitSecs(opts.deadlineAt)
          : DEFAULT_HOST_LOCK_WAIT_SECS;
      // Pass the ABSOLUTE deadline too (#0521 review), not just the relative
      // `waitSecs` budget computed here — SSH connection time (which the
      // remote script has no visibility into) happens after this point and
      // before the script starts self-clocking, so a relative budget alone
      // can let a run start well past the caller's real deadline.
      const deadlineAtEpochSecs =
        opts.deadlineAt !== undefined ? Math.floor(opts.deadlineAt / 1000) : undefined;
      const lockPriority = hostLockPriority(opts.phase);
      const metaJson = hostLockMetaJson({
        taskId: opts.taskId,
        phase: opts.phase,
        worktree: opts.worktreePath,
        priority: lockPriority,
      });
      const cmd = hostLockShell({
        slots: slot.limit,
        waitSecs,
        deadlineAtEpochSecs,
        inner,
        metaJson,
        priority: lockPriority,
      });
      // The outer SSH timeout must cover the lock wait AND the actual run —
      // it wraps BOTH phases as one process, but was a fixed remoteRunTimeoutMs
      // regardless of how long waitSecs allowed the lock to wait first
      // (#0521 review). A run that legitimately waited most of its lock
      // budget (queued behind other jobs, not stuck) then had only
      // remoteRunTimeoutMs minus that wait left for build+test — a healthy
      // suite could be SIGKILLed and reported as an infra failure purely
      // because of how long it queued, not because anything was actually
      // wrong. Add the wait budget on top so the full remoteRunTimeoutMs is
      // always available for the run itself once it actually starts.
      const outerTimeoutMs = this.timings.remoteRunTimeoutMs + waitSecs * 1000;
      this.setActiveRunStage(
        {
          taskId: opts.taskId,
          host: host.ip,
          phase: opts.phase ?? "pre-review",
          scope: runScope,
          startedAt: new Date(startedAt).toISOString(),
          stage: "run",
          uploadBytes: upload.bundleBytes,
          uploadSeconds,
        },
        opts.taskId,
      );
      const run = await this.exec.runRemote(host, cmd, emit, outerTimeoutMs);

      // 4. pull artifacts (best effort)
      await this.exec.downloadDir(
        host,
        `${paths.artifacts}/*`,
        join(this.config.root, ".repoos", "logs", "remote-validation", opts.taskId),
      );

      const elapsed = Math.round((Date.now() - startedAt) / 1000);
      if (run.timedOut) {
        emit(`\n[remote run SIGKILLed after ${Math.round(outerTimeoutMs / 60000)}m]\n`);
        this.logger?.integration(
          opts.taskId,
          "warn",
          `remote validation timed out after ${elapsed}s`,
        );
        this.pool.recordRun(host.ip, opts.taskId, false, Date.now() - startedAt);
        const detail = `remote validation timed out after ${elapsed}s — retrying resumes from the check step`;
        this.record(
          { taskId: opts.taskId, host: host.ip, phase: "result" },
          {
            level: "warn",
            phase: "result",
            message: detail,
            host: host.ip,
            exitCode: null,
            infra: true,
          },
        );
        return withScope({
          ok: false,
          stage: "check",
          transient: true,
          exitCode: null,
          output: tail(run.output, 40, 4000),
          detail,
        });
      }
      if (run.code === HOST_LOCK_TIMEOUT_EXIT && run.output.includes("[lock]")) {
        // Another repoos process held the host past our wait — the cap did its
        // job; this run gives its slot back and retries later.
        emit(`\n[host busy — another repoos check held ${host.ip}]\n`);
        this.pool.recordRun(host.ip, opts.taskId, false, Date.now() - startedAt);
        const holderNote = formatHostLockHolderSummary(this.pool.hostLockFor(host.ip));
        return withScope(
          this.infraFail(
            `another repoos check is already running on ${host.ip} — waited ${elapsed}s for a free host slot ` +
              "(the per-host limit is shared by the server and standalone `repoos check`)" +
              holderNote,
            { taskId: opts.taskId, host: host.ip, exitCode: run.code },
          ),
        );
      }
      if (run.code === 0) {
        emit(`\n[remote validation PASSED in ${elapsed}s on ${host.ip}]\n`);
        this.logger?.integration(opts.taskId, "info", `remote validation passed in ${elapsed}s`);
        this.pool.recordRun(host.ip, opts.taskId, true, Date.now() - startedAt);
        this.record(
          { taskId: opts.taskId, host: host.ip, phase: "result" },
          {
            level: "info",
            phase: "result",
            message: `remote validation passed in ${elapsed}s on ${host.ip}`,
            host: host.ip,
            exitCode: 0,
          },
        );
        return withScope({ ok: true, stage: "check" });
      }

      // Non-zero: the ssh transport itself could have dropped (code 255) — treat
      // that as infra, not a real test failure, and remember the host is sick.
      if (
        run.code === 255 &&
        /(?:Connection|ssh:|closed by remote host|Broken pipe)/i.test(run.output)
      ) {
        const detail = `ssh connection to ${host.ip} dropped mid-run: ${tail(run.output)}`;
        this.pool.markUnhealthy(host.ip, detail);
        this.pool.recordRun(host.ip, opts.taskId, false, Date.now() - startedAt);
        return withScope(
          this.infraFail(detail, {
            taskId: opts.taskId,
            host: host.ip,
            exitCode: 255,
          }),
        );
      }
      const transient = looksTransient(run.output);
      emit(`\n[remote validation FAILED (exit ${run.code}) in ${elapsed}s on ${host.ip}]\n`);
      this.logger?.integration(opts.taskId, "warn", `remote validation failed (exit ${run.code})`, {
        transient,
      });
      this.pool.recordRun(host.ip, opts.taskId, false, Date.now() - startedAt);
      this.record(
        { taskId: opts.taskId, host: host.ip, phase: "result" },
        {
          level: transient ? "warn" : "error",
          phase: "result",
          message: `remote validation failed (exit ${run.code}) on ${host.ip}`,
          host: host.ip,
          exitCode: run.code,
          infra: transient,
        },
      );
      return withScope({
        ok: false,
        stage: "check",
        exitCode: run.code,
        transient,
        output: tail(run.output, 40, 4000),
        detail: `remote validation failed (exit ${run.code}) — ${tail(run.output)}`,
      });
    } catch (e) {
      return withScope(
        this.infraFail((e as Error).message, { taskId: opts.taskId, host: host.ip }),
      );
    } finally {
      if (tmp) rmSync(tmp, { recursive: true, force: true });
      this.setActiveRunStage(null, opts.taskId);
    }
  }

  // The tailscale runner has no VMs to reconcile; dispose clears queue timers.
  async reconcile(): Promise<void> {}
  async dispose(): Promise<void> {
    this.pool.dispose();
  }
}

// ── factory ──────────────────────────────────────────────────────────────────

/**
 * Returns the right RemoteValidator for the configured provider, or undefined
 * if remote validation is disabled. Constructed at server boot; a later
 * Settings save calls {@link TailscaleRunner.applyConfig} on the same instance
 * so the live host pool matches the saved list without a restart.
 */
export function createRemoteValidator(
  config: RepoOSConfig,
  logger?: Logger,
): RemoteValidator | undefined {
  if (!config.remoteValidation?.enabled) return undefined;
  const provider = config.remoteValidation.provider ?? "hetzner";
  if (provider === "tailscale") {
    return new TailscaleRunner(config, logger);
  }
  return new RemoteValidationRunner(config, logger);
}
