/**
 * Remote Validation Runner (#RVR).
 *
 * The close-out gate's expensive half — `bun install` + `bun run build` +
 * `bun run test` — is what makes MTD fail on the developer's machine under
 * memory pressure (see docs/remote-validation.md, memory
 * `repoos-check-flakes-under-memory-pressure`). This module runs that half on a
 * disposable Hetzner VM instead:
 *
 *   1. ensure a runner VM exists (create from a prebuilt snapshot, or reuse a
 *      still-warm one), one at a time, never more than one
 *   2. `git bundle` the already-merged candidate tree and scp it up
 *   3. ssh in and run `/opt/repoos/validate.sh` — which checks out the exact
 *      candidate SHA and runs build + test inside the `repoos-ci` Docker image
 *   4. stream combined output back to a per-task log file and the caller
 *   5. pull any artifacts, then arm an idle-shutdown timer
 *
 * The result is shaped as a {@link CheckSummary} so it is a drop-in for
 * `runCloseOutCheck` in the two close-out paths (done.ts, integration-
 * orchestrator.ts). Infra failures (provisioning, ssh) come back with
 * `transient: true` — the caller decides whether to fail retryably or fall
 * back to a local run (`remoteValidation.fallbackToLocal`).
 */

import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { mkdtempSync, mkdirSync, rmSync, appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { RepoOSConfig } from "../core/types.js";
import type { Logger } from "../core/logger.js";
import type { CheckSummary } from "./done.js";
import { redactSecrets, stripAnsi } from "./done.js";
import { createHetznerClient, type HetznerClient, type HetznerServer } from "./hetzner.js";

/** Label every runner VM carries, so leaked ones are always findable. */
const RUNNER_LABEL_KEY = "repoos-ci";
const RUNNER_LABEL_SELECTOR = `${RUNNER_LABEL_KEY}=1`;
const SSH_PORT = 22;

export interface RemoteHost {
  ip: string;
  user: string;
  /** Path to the private key matching the Hetzner-registered public key. */
  keyPath: string;
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
  uploadFile(host: RemoteHost, localPath: string, remotePath: string): Promise<{ ok: boolean; detail?: string }>;
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
}

export interface RemoteValidator {
  validate(opts: ValidateOptions): Promise<CheckSummary>;
  /** Delete leaked runner VMs. Call at server boot (nothing is validating then). */
  reconcile(): Promise<void>;
  /** Tear down any warm VM and cancel timers. Call on server shutdown. */
  dispose(): Promise<void>;
  /** Absolute path of the per-task log file (may not exist yet). */
  logPath(taskId: string): string;
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
}

const DEFAULT_TIMINGS: RunnerTimings = {
  provisionPollMs: 4_000,
  provisionTimeoutMs: 180_000,
  sshProbeIntervalMs: 3_000,
  sshWaitTimeoutMs: 120_000,
  remoteRunTimeoutMs: 25 * 60_000,
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

// ── default IO implementation ────────────────────────────────────────────────

function sshArgs(host: RemoteHost): string[] {
  return [
    "-i",
    host.keyPath,
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
      return res.code === 0
        ? { ok: true }
        : { ok: false, detail: tail(res.output) };
    },
    async uploadFile(host, localPath, remotePath) {
      const res = await runLocal(
        "scp",
        [...sshArgs(host), localPath, `${host.user}@${host.ip}:${remotePath}`],
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
      return runLocal(
        "ssh",
        [...sshArgs(host), `${host.user}@${host.ip}`, command],
        { timeoutMs, onChunk },
      );
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
  private readonly sshUser = "root";
  private state: RunnerState | null = null;
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
      if (parsed && typeof parsed.serverId === "number") this.state = parsed;
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
      mkdirSync(join(this.config.root, ".repoos", "logs", "remote-validation"), { recursive: true });
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

  async validate(opts: ValidateOptions): Promise<CheckSummary> {
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
      const remoteBundle = `/tmp/repoos-${opts.taskId}.bundle`;
      const up = await this.exec.uploadFile(host, bundlePath, remoteBundle);
      if (!up.ok) return this.infraFail(`scp of candidate bundle failed: ${up.detail ?? "unknown"}`);

      // 3. run build + test inside the container
      emit(`[running build + test on ${host.ip}]\n`);
      const cmd = `/opt/repoos/validate.sh ${remoteBundle} ${opts.candidateSha}`;
      const run = await this.exec.runRemote(host, cmd, emit, this.timings.remoteRunTimeoutMs);

      // 4. pull artifacts (best effort)
      await this.exec.downloadDir(
        host,
        "/tmp/repoos-artifacts/*",
        join(this.config.root, ".repoos", "logs", "remote-validation", opts.taskId),
      );

      const elapsed = Math.round((Date.now() - startedAt) / 1000);
      if (run.timedOut) {
        emit(`\n[remote run SIGKILLed after ${Math.round(this.timings.remoteRunTimeoutMs / 60000)}m]\n`);
        this.logger?.integration(opts.taskId, "warn", `remote validation timed out after ${elapsed}s`);
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
      if (run.code === 255 && /(?:Connection|ssh:|closed by remote host|Broken pipe)/i.test(run.output)) {
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
      throw new Error(`runner ${ip} never accepted SSH within ${this.timings.sshWaitTimeoutMs / 1000}s`);
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
      this.logger?.system("info", `reconcile: deleted stray remote validation runner ${s.id} (${s.name})`);
    }
    this.saveState();
  }

  async dispose(): Promise<void> {
    this.clearIdleTimer();
    if (this.lifetimeTimer) clearTimeout(this.lifetimeTimer);
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
