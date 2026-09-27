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
import { randomBytes } from "node:crypto";
import { createConnection } from "node:net";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { RepoOSConfig, RemoteValidationConfig, RemoteValidationHost } from "../core/types.js";
import {
  describeCapabilities,
  hostSatisfies,
  positiveLimit,
  remoteHostLimit,
  remoteHostUser,
  resolveRemoteHosts,
} from "../core/remote-hosts.js";
import type { Logger } from "../core/logger.js";
import type { CheckSummary } from "./done.js";
import { redactSecrets, stripAnsi } from "./done.js";

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
  /** `git bundle create <outPath> HEAD` in `cwd`. */
  bundleRepo(cwd: string, outPath: string): Promise<{ ok: boolean; detail?: string }>;
  /** `scp <localPath> <host>:<remotePath>`. */
  uploadFile(
    host: RemoteHost,
    localPath: string,
    remotePath: string,
  ): Promise<{ ok: boolean; detail?: string }>;
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
  lastRun?: { taskId: string; ok: boolean; at: string };
}

export interface RemoteValidator {
  validate(opts: ValidateOptions): Promise<CheckSummary>;
  /** Delete leaked runner VMs. Call at server boot (nothing is validating then). */
  reconcile(): Promise<void>;
  /** Tear down any warm VM and cancel timers. Call on server shutdown. */
  dispose(): Promise<void>;
  /** Absolute path of the per-task log file (may not exist yet). */
  logPath(taskId: string): string;
  /** Per-host pool state for the status endpoint (#0521). Optional: the
   *  Hetzner runner is a single server-owned VM with no pool to report. */
  hostStatus?(): RemoteHostStatus[];
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
}

const DEFAULT_TIMINGS: RunnerTimings = {
  provisionPollMs: 4_000,
  provisionTimeoutMs: 180_000,
  sshProbeIntervalMs: 3_000,
  sshWaitTimeoutMs: 120_000,
  remoteRunTimeoutMs: 25 * 60_000,
  probeTimeoutMs: 20_000,
  healthRetryMs: 30_000,
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

// ── host prerequisites + the cross-process host lock (#0521) ────────────────

/** The gate script every host must carry, and the token a passing probe prints. */
export const VALIDATE_SCRIPT = "/opt/repoos/validate.sh";
export const PREREQ_OK_TOKEN = "REPOOS_PREREQ_OK";
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

/**
 * Per-host prerequisite check (#0521) run over ssh before a host's first job,
 * so a misconfigured host is REPORTED (health + detail in the status endpoint)
 * instead of failing jobs with an opaque error mid-run. Checks the toolchain
 * the host's `validate.sh` needs and that the script is an up-to-date copy
 * accepting the per-run artifacts dir as its third argument (#0520).
 *
 * `os` is accepted (and still used elsewhere for `runsOn` capability
 * routing) but does NOT change which toolchain gets probed: `just
 * setup-<host>` / `_setup-runner` installs the same Docker-based
 * `validate.sh` on every host regardless of OS — including macOS
 * (`just setup-mini` requires Docker Desktop; see the justfile) — there is
 * no wired-up native bun/git runner path. A prior version of this probe
 * checked for `bun`/`git` on a macOS host, which fails a correctly
 * Docker-provisioned macOS host and never actually verifies the toolchain
 * that host runs (#0521 review).
 */
export function prereqProbeCommand(_os?: string): string {
  const lines = [
    'command -v docker >/dev/null 2>&1 || { echo "docker not found on PATH"; exit 1; }',
    'docker info >/dev/null 2>&1 || { echo "docker daemon not reachable (is docker running?)"; exit 1; }',
  ];
  lines.push(
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
   */
  lockRoot?: string;
  /** Stale threshold in minutes (tests shrink this). */
  staleMinutes?: number;
  /** Heartbeat interval in seconds (tests shrink this). */
  heartbeatSecs?: number;
  /** Heartbeat tick cap (tests shrink this). */
  heartbeatTicks?: number;
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
  // Floor of 1: `-mmin +0` would break even a fresh dir the moment it ages
  // past one truncated minute, which a live holder only notices too late.
  const stale = Math.max(1, Math.floor(opts.staleMinutes ?? HOST_LOCK_STALE_MINUTES));
  const beat = Math.max(1, Math.floor(opts.heartbeatSecs ?? HOST_LOCK_HEARTBEAT_SECS));
  const ticks = Math.max(1, Math.floor(opts.heartbeatTicks ?? HOST_LOCK_HEARTBEAT_TICKS));
  const script = [
    lockLine,
    `SLOTS=${slots}`,
    `WAIT=${wait}`,
    'mkdir -p "$LOCKROOT" 2>/dev/null || true',
    '_rvslot=""',
    "_rvwaited=0",
    'while [ -z "$_rvslot" ]; do',
    "  _i=0",
    '  while [ "$_i" -lt "$SLOTS" ]; do',
    '    if mkdir "$LOCKROOT/$_i" 2>/dev/null; then _rvslot="$_i"; break; fi',
    "    _i=$((_i+1))",
    "  done",
    '  [ -n "$_rvslot" ] && break',
    '  if [ "$_rvwaited" -ge "$WAIT" ]; then',
    '    echo "[lock] timed out after ${WAIT}s waiting for a free slot on this host — another repoos check is still running"',
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
    '_rvcleanup() { _rc=$?; kill "$_rvhb" 2>/dev/null; rmdir "$LOCKROOT/$_rvslot" 2>/dev/null; exit $_rc; }',
    "trap _rvcleanup EXIT",
    "trap 'exit 129' HUP",
    "trap 'exit 130' INT",
    "trap 'exit 143' TERM",
    opts.inner,
  ];
  return script.join("\n");
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
    child.stdin?.end(stdin);
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

export function defaultRemoteExec(): RemoteExecDeps {
  return {
    async bundleRepo(cwd, outPath) {
      const res = await runLocal("git", ["bundle", "create", outPath, "HEAD"], {
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
  private infraFail(detail: string): CheckSummary {
    this.logger?.system("warn", `remote validation unavailable: ${detail}`);
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
  private configFail(detail: string): CheckSummary {
    this.logger?.system("error", `remote validation cannot run: ${detail}`);
    return {
      ok: false,
      stage: "check",
      transient: false,
      configError: true,
      detail: `remote validation cannot run: ${detail}`,
    };
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
      );
    }
    // Queue deadline (#0521 spec item 5): a run still queued when its caller
    // gives up is cancelled and never holds a slot — the same promise the
    // Tailscale pool's queue timer makes (this path used to ignore
    // `deadlineAt` entirely, so a queued Hetzner run could outlive the
    // handoff's 10-minute deadline).
    let release: () => void;
    try {
      release = await this.gate.acquire(
        (ahead) => {
          const note =
            `[queued behind ${ahead} other remote run(s) — remoteValidation.maxConcurrent = ` +
            `${this.gate.limit}; starts when a slot frees]\n`;
          this.appendLog(opts.taskId, note);
          opts.onChunk?.(note);
        },
        { deadlineAt: opts.deadlineAt },
      );
    } catch (e) {
      const detail = e instanceof QueueDeadlineError ? e.message : `remote slot wait failed: ${e}`;
      const note = `[remote validation not started: ${detail}]\n`;
      this.appendLog(opts.taskId, note);
      opts.onChunk?.(note);
      return this.infraFail(detail);
    }
    try {
      // Dispatch can hand over a free slot in the same tick the deadline
      // passes — cancel here rather than start a suite nobody waits for.
      if (opts.deadlineAt !== undefined && Date.now() >= opts.deadlineAt) {
        return this.infraFail(
          "the caller's deadline passed before the run could start on the Hetzner runner — " +
            "the run was cancelled (retry once a slot is free)",
        );
      }
      return await this.runValidation(opts, remoteRunPaths(opts.taskId));
    } finally {
      release();
    }
  }

  private async runValidation(opts: ValidateOptions, paths: RemoteRunPaths): Promise<CheckSummary> {
    const rv = this.config.remoteValidation ?? {};
    if (!rv.enabled) return this.infraFail("remote validation is disabled");
    if (!process.env.HETZNER_API_TOKEN) return this.infraFail("HETZNER_API_TOKEN is not set");
    if (!this.keyPath || !existsSync(this.keyPath)) {
      return this.infraFail("REPOOS_REMOTE_SSH_KEY is not set or the key file is missing");
    }
    if (!rv.snapshotId) return this.infraFail("remoteValidation.snapshotId is not configured");
    if (!rv.sshKeyName) return this.infraFail("remoteValidation.sshKeyName is not configured");

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
      emit(`[runner ${host.ip} ready in ${Math.round((Date.now() - startedAt) / 1000)}s]\n`);

      // 1. bundle the candidate tree
      tmp = mkdtempSync(join(tmpdir(), "repoos-rvr-"));
      const bundlePath = join(tmp, "candidate.bundle");
      const bundle = await this.exec.bundleRepo(opts.worktreePath, bundlePath);
      if (!bundle.ok) return this.infraFail(`git bundle failed: ${bundle.detail ?? "unknown"}`);

      // 2. upload
      const remoteBundle = paths.bundle;
      const up = await this.exec.uploadFile(host, bundlePath, remoteBundle);
      if (!up.ok)
        return this.infraFail(`scp of candidate bundle failed: ${up.detail ?? "unknown"}`);

      // Provisioning + bundling can outlast the caller's deadline (#0521 spec
      // item 5) — never start a suite for a caller that already gave up.
      if (opts.deadlineAt !== undefined && Date.now() >= opts.deadlineAt) {
        return this.infraFail(
          `the caller's deadline passed before the run could start on ${host.ip} — the run was cancelled`,
        );
      }

      // 3. run build + test inside the container
      emit(`[running build + test on ${host.ip}]\n`);
      const cmd = `/opt/repoos/validate.sh ${remoteBundle} ${opts.candidateSha} ${paths.artifacts}`;
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
        return {
          ok: false,
          stage: "check",
          transient: true,
          exitCode: null,
          output: tail(run.output, 40, 4000),
          detail: `remote validation timed out after ${elapsed}s (the runner VM may be overloaded) — retrying resumes from the check step`,
        };
      }
      if (run.code === 0) {
        emit(`\n[remote validation PASSED in ${elapsed}s]\n`);
        this.logger?.integration(opts.taskId, "info", `remote validation passed in ${elapsed}s`);
        return { ok: true, stage: "check" };
      }

      // Non-zero: the ssh transport itself could have dropped (code 255) — treat
      // that as infra, not a real test failure.
      if (
        run.code === 255 &&
        /(?:Connection|ssh:|closed by remote host|Broken pipe)/i.test(run.output)
      ) {
        return this.infraFail(`ssh connection to the runner dropped mid-run: ${tail(run.output)}`);
      }
      const transient = looksTransient(run.output);
      emit(`\n[remote validation FAILED (exit ${run.code}) in ${elapsed}s]\n`);
      this.logger?.integration(opts.taskId, "warn", `remote validation failed (exit ${run.code})`, {
        transient,
      });
      return {
        ok: false,
        stage: "check",
        exitCode: run.code,
        transient,
        output: tail(run.output, 40, 4000),
        detail: `remote validation failed (exit ${run.code}) — ${tail(run.output)}`,
      };
    } catch (e) {
      return this.infraFail((e as Error).message);
    } finally {
      if (tmp) rmSync(tmp, { recursive: true, force: true });
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
  probed: boolean;
  healthy: boolean;
  detail?: string;
  /** Earliest time a probe retry may run. */
  retryAt: number;
  /** Consecutive probe failures, capped so retries can't loop forever. */
  healthFails: number;
  probing?: Promise<void>;
  retryTimer?: ReturnType<typeof setTimeout>;
  lastRun?: { taskId: string; ok: boolean; at: string };
}

interface PoolWaiter {
  capabilities: string[];
  resolve: (slot: HostSlot) => void;
  reject: (err: Error) => void;
  onQueue?: (ahead: number) => void;
  timer?: ReturnType<typeof setTimeout>;
}

/** How long an unhealthy host waits before a probe may retry it. */
const HEALTH_RETRY_MS = 30_000;
/**
 * Consecutive failed probes before a host stops being retried. Hitting the cap
 * must not strand queued runs: callers such as close-out and release pass no
 * `deadlineAt`, so a waiter left behind by the stopped retry chain would await
 * a slot forever (#0521 review). {@link TailscaleHostPool.settleHopelessWaiters}
 * rejects waiters whose eligible hosts have ALL hit this cap.
 */
const MAX_HEALTH_RETRIES = 10;

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
 *   instead of waiting forever (close-out and release pass no deadline).
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
  private readonly keyPath?: string;
  private readonly logger?: Logger;

  constructor(rv: RemoteValidationConfig | undefined, opts: HostPoolOptions) {
    this.exec = opts.exec;
    this.logger = opts.logger;
    this.probeTimeoutMs = opts.probeTimeoutMs ?? 20_000;
    this.healthRetryMs = opts.healthRetryMs ?? HEALTH_RETRY_MS;
    const key = opts.keyPath ?? "";
    this.keyPath = key && existsSync(key) ? key : undefined;
    for (const spec of resolveRemoteHosts(rv)) {
      this.hosts.push({
        spec,
        ssh: { ip: spec.host, user: rv ? remoteHostUser(rv, spec) : "root", keyPath: this.keyPath },
        limit: rv ? remoteHostLimit(rv, spec) : 1,
        active: 0,
        probed: false,
        healthy: false,
        retryAt: 0,
        healthFails: 0,
      });
    }
  }

  get size(): number {
    return this.hosts.length;
  }

  /** Queued runs, for the status endpoint. */
  get queuedCount(): number {
    return this.waiters.length;
  }

  /**
   * Lease a host providing every capability. Throws {@link NoEligibleHostError}
   * (nobody provides them / no hosts configured), {@link HostsUnavailableError}
   * (all eligible hosts failed their probe), or {@link QueueDeadlineError}
   * (still queued when `deadlineAt` passed).
   */
  async acquire(
    capabilities: string[],
    opts: { onQueue?: (ahead: number) => void; deadlineAt?: number } = {},
  ): Promise<HostSlot> {
    if (this.hosts.length === 0) {
      throw new NoEligibleHostError("remoteValidation.tailscaleHost is not configured");
    }
    const candidates = this.hosts.filter((s) => hostSatisfies(s.spec, capabilities));
    if (candidates.length === 0) {
      throw new NoEligibleHostError(
        `no remote host provides ${describeCapabilities(capabilities)} ` +
          `(configured: ${this.hosts.map((s) => this.describe(s)).join(", ")}) — ` +
          "add a [[remoteValidation.tailscaleHosts]] row whose `os` or `labels` provide it",
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
      await Promise.all(
        candidates.map((s) => (!s.healthy && Date.now() >= s.retryAt ? this.probe(s) : undefined)),
      );
      healthy = candidates.filter((s) => s.healthy);
    }
    if (healthy.length === 0) {
      throw new HostsUnavailableError(
        `no usable remote host for ${describeCapabilities(capabilities)} — ` +
          candidates.map((s) => `${s.spec.host}: ${s.detail ?? "unreachable"}`).join("; "),
      );
    }
    const free = healthy.filter((s) => s.healthy && s.active < s.limit);
    if (free.length > 0) {
      // Somebody already queued may be ahead of this arrival for that slot
      // (#0521 review: e.g. a host recovering while a waiter holds the queue).
      // Dispatch first, then re-check — a late arrival never jumps the queue.
      if (this.waiters.length > 0) this.dispatch();
      const nowFree = healthy
        .filter((s) => s.healthy && s.active < s.limit)
        .sort((a, b) => a.active - b.active);
      if (nowFree.length > 0) return this.assign(nowFree[0]!);
    }

    // Every eligible host is at its cap — queue, FIFO, and only until one of
    // THEM frees (a later-arriving compatible job never jumps the queue).
    return new Promise<HostSlot>((resolve, reject) => {
      const waiter: PoolWaiter = { capabilities, resolve, reject, onQueue: opts.onQueue };
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
      const ahead = candidates.reduce((n, s) => n + s.active, 0) + (this.waiters.length - 1);
      waiter.onQueue?.(ahead);
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
  recordRun(host: string, taskId: string, ok: boolean): void {
    const s = this.hosts.find((c) => c.spec.host === host);
    if (s) s.lastRun = { taskId, ok, at: new Date().toISOString() };
  }

  /** Per-host state for `/api/remote-validation/status`. */
  status(): RemoteHostStatus[] {
    // Each queued run counts against exactly ONE host — the one dispatch would
    // hand it next (eligible, preferring a healthy host, then least loaded) —
    // so per-host `queued` totals sum to the real queue length instead of
    // counting one waiter once per compatible host (#0521 review).
    const queuedOn = new Map<PoolHostState, number>();
    for (const w of this.waiters) {
      const next = this.hosts
        .filter((s) => hostSatisfies(s.spec, w.capabilities))
        .sort((a, b) => Number(b.healthy) - Number(a.healthy) || a.active - b.active)[0];
      if (next) queuedOn.set(next, (queuedOn.get(next) ?? 0) + 1);
    }
    return this.hosts.map((s) => ({
      host: s.spec.host,
      user: s.ssh.user,
      os: s.spec.os,
      labels: s.spec.labels ?? [],
      maxConcurrent: s.limit,
      inFlight: s.active,
      queued: queuedOn.get(s) ?? 0,
      probed: s.probed,
      healthy: s.healthy,
      detail: s.detail,
      lastRun: s.lastRun,
    }));
  }

  /**
   * Shut the pool down: clear timers AND reject every queued waiter (#0521
   * review) — a `validate()` awaiting a slot must fail promptly with a
   * transient infra summary, not hang forever after a restart/dispose.
   */
  dispose(): void {
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

  private assign(s: PoolHostState): HostSlot {
    s.active++;
    let released = false;
    return {
      host: s.spec,
      ssh: s.ssh,
      limit: s.limit,
      release: () => {
        if (released) return;
        released = true;
        s.active = Math.max(0, s.active - 1);
        this.dispatch();
      },
    };
  }

  /** Hand freed slots to the earliest compatible waiter (FIFO, skipping none
   *  that cannot run yet — a macos-only waiter never blocks a linux job). */
  private dispatch(): void {
    for (let i = 0; i < this.waiters.length;) {
      const w = this.waiters[i]!;
      const free = this.hosts
        .filter((s) => s.healthy && s.active < s.limit && hostSatisfies(s.spec, w.capabilities))
        .sort((a, b) => a.active - b.active)[0];
      if (!free) {
        i++;
        continue;
      }
      this.settle(w);
      w.resolve(this.assign(free));
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
        prereqProbeCommand(s.spec.os),
        () => {},
        this.probeTimeoutMs,
      );
      ok = res.code === 0 && res.output.includes(PREREQ_OK_TOKEN);
      if (!ok) {
        const why = tail(res.output, 5, 600);
        detail = `prerequisite check failed (exit ${res.code ?? "signal"}): ${why}`;
      }
    } catch (e) {
      detail = `prerequisite check failed: ${(e as Error).message}`;
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
   * callers without their own deadline (close-out in
   * `integration-orchestrator.ts`, `release.ts`) would otherwise await a slot
   * forever. A waiter with ANY still-recoverable eligible host — healthy,
   * still inside its retry budget, or mid-probe — stays queued.
   */
  private settleHopelessWaiters(): void {
    for (const w of [...this.waiters]) {
      const eligible = this.hosts.filter((s) => hostSatisfies(s.spec, w.capabilities));
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
}

/** Knobs the pool takes from the runner (tests shrink these). */
export interface HostPoolOptions {
  exec: RemoteExecDeps;
  logger?: Logger;
  /** SSH key path; omitted → SSH default resolution (agent, ~/.ssh/config). */
  keyPath?: string;
  probeTimeoutMs?: number;
  healthRetryMs?: number;
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
    });
  }

  logPath(taskId: string): string {
    return join(this.config.root, ".repoos", "logs", "remote-validation", `${taskId}.log`);
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

  private infraFail(detail: string): CheckSummary {
    this.logger?.system("warn", `remote validation unavailable: ${detail}`);
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
  private configFail(detail: string): CheckSummary {
    this.logger?.system("error", `remote validation cannot run: ${detail}`);
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
    if (!rv.enabled) return this.infraFail("remote validation is disabled");
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
    let slot: HostSlot;
    try {
      slot = await this.pool.acquire(capabilities, {
        deadlineAt: opts.deadlineAt,
        onQueue: (ahead) => emit(this.queueNote(ahead, capabilities)),
      });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      emit(`[remote validation not started: ${detail}]\n`);
      if (e instanceof NoEligibleHostError) return this.configFail(detail);
      return this.infraFail(detail);
    }

    try {
      return await this.runValidation(opts, slot, capabilities);
    } finally {
      slot.release();
    }
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
    const emit = (s: string): void => {
      this.appendLog(opts.taskId, s);
      opts.onChunk?.(s);
    };
    emit(
      `\n── remote validation (tailscale) for #${opts.taskId} @ ${opts.candidateSha.slice(0, 12)} ──\n`,
    );
    // Which host ran this job — the record the per-task log keeps (#0521).
    emit(
      `[runner ${host.user}@${host.ip}${slot.host.os ? ` (${slot.host.os})` : ""}]` +
        `${capabilities.length ? ` [requires ${describeCapabilities(capabilities)}]` : ""}\n`,
    );

    let tmp: string | null = null;
    try {
      // 1. bundle the candidate tree
      tmp = mkdtempSync(join(tmpdir(), "repoos-rvr-"));
      const bundlePath = join(tmp, "candidate.bundle");
      const bundle = await this.exec.bundleRepo(opts.worktreePath, bundlePath);
      if (!bundle.ok) return this.infraFail(`git bundle failed: ${bundle.detail ?? "unknown"}`);

      // 2. upload
      const remoteBundle = paths.bundle;
      const up = await this.exec.uploadFile(host, bundlePath, remoteBundle);
      if (!up.ok)
        return this.infraFail(`scp of candidate bundle failed: ${up.detail ?? "unknown"}`);

      // 3. run build + test via validate.sh on the host (which calls docker run
      //    itself), wrapped in the host-side slot lock so this process's gate
      //    and every other repoos process share ONE per-host limit (#0521).
      const image = rv.containerImage ?? "repoos-ci";
      // Never enter the host lock after the caller's deadline (#0521 spec
      // item 5): a run whose caller already gave up (dispatch can win the race
      // with the queue timer, or the deadline passes during bundle/upload) must
      // not start a suite or hold a slot — cancel transiently, like a queued run.
      if (opts.deadlineAt !== undefined && Date.now() >= opts.deadlineAt) {
        return this.infraFail(
          `the caller's deadline passed before the run could start on ${host.ip} — the run was cancelled`,
        );
      }
      emit(`[running build + test in ${image} on ${host.ip}]\n`);
      const inner = `REPOOS_CI_IMAGE=${image} ${VALIDATE_SCRIPT} ${remoteBundle} ${opts.candidateSha} ${paths.artifacts}`;
      const waitSecs =
        opts.deadlineAt !== undefined
          ? deadlineLockWaitSecs(opts.deadlineAt)
          : DEFAULT_HOST_LOCK_WAIT_SECS;
      const cmd = hostLockShell({ slots: slot.limit, waitSecs, inner });
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
        this.pool.recordRun(host.ip, opts.taskId, false);
        return {
          ok: false,
          stage: "check",
          transient: true,
          exitCode: null,
          output: tail(run.output, 40, 4000),
          detail: `remote validation timed out after ${elapsed}s — retrying resumes from the check step`,
        };
      }
      if (run.code === HOST_LOCK_TIMEOUT_EXIT && run.output.includes("[lock]")) {
        // Another repoos process held the host past our wait — the cap did its
        // job; this run gives its slot back and retries later.
        emit(`\n[host busy — another repoos check held ${host.ip}]\n`);
        this.pool.recordRun(host.ip, opts.taskId, false);
        return this.infraFail(
          `another repoos check is already running on ${host.ip} — waited ${elapsed}s for a free host slot ` +
            "(the per-host limit is shared by the server and standalone `repoos check`)",
        );
      }
      if (run.code === 0) {
        emit(`\n[remote validation PASSED in ${elapsed}s on ${host.ip}]\n`);
        this.logger?.integration(opts.taskId, "info", `remote validation passed in ${elapsed}s`);
        this.pool.recordRun(host.ip, opts.taskId, true);
        return { ok: true, stage: "check" };
      }

      // Non-zero: the ssh transport itself could have dropped (code 255) — treat
      // that as infra, not a real test failure, and remember the host is sick.
      if (
        run.code === 255 &&
        /(?:Connection|ssh:|closed by remote host|Broken pipe)/i.test(run.output)
      ) {
        const detail = `ssh connection to ${host.ip} dropped mid-run: ${tail(run.output)}`;
        this.pool.markUnhealthy(host.ip, detail);
        this.pool.recordRun(host.ip, opts.taskId, false);
        return this.infraFail(detail);
      }
      const transient = looksTransient(run.output);
      emit(`\n[remote validation FAILED (exit ${run.code}) in ${elapsed}s on ${host.ip}]\n`);
      this.logger?.integration(opts.taskId, "warn", `remote validation failed (exit ${run.code})`, {
        transient,
      });
      this.pool.recordRun(host.ip, opts.taskId, false);
      return {
        ok: false,
        stage: "check",
        exitCode: run.code,
        transient,
        output: tail(run.output, 40, 4000),
        detail: `remote validation failed (exit ${run.code}) — ${tail(run.output)}`,
      };
    } catch (e) {
      return this.infraFail((e as Error).message);
    } finally {
      if (tmp) rmSync(tmp, { recursive: true, force: true });
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
 * if remote validation is disabled. Called once at server boot.
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
