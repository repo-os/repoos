/**
 * Candidate bundle upload over SSH (#0917).
 *
 * Streams the bundle in chunks with byte-accurate progress, hard stall and
 * wall-clock budgets, ServerAlive on the SSH session, and a process-wide
 * serialization lock so parallel close-outs do not saturate the uplink.
 */
import { createReadStream, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { writeChildStdin } from "../core/child-stdin.js";
import { parseDocument } from "../core/frontmatter.js";
import { pressureReason } from "../core/pressure-guard.js";
import type { RepoOSConfig } from "../core/types.js";

/** Minimal SSH target for bundle upload (matches {@link RemoteHost}). */
export interface BundleUploadHost {
  ip: string;
  user: string;
  keyPath?: string;
}

/** Default wall-clock budget for one upload attempt (2–3 minutes). */
export const DEFAULT_BUNDLE_UPLOAD_BUDGET_SECS = 180;
/** No bytes written for this long → treat as stalled (#0917). */
export const DEFAULT_BUNDLE_UPLOAD_STALL_SECS = 90;
/** Small probe payload for link quality (#0917). */
export const LINK_PROBE_BYTES = 64 * 1024;
/** RTT above this → prefer local gate when allowed (#0917). */
export const HIGH_RTT_MS = 1000;
/** Upload alone longer than this at measured rate → prefer local (#0917). */
export const SLOW_UPLOAD_BUDGET_SECS = 180;

const CHUNK_BYTES = 256 * 1024;

export interface BundleUploadLimits {
  budgetMs: number;
  stallMs: number;
}

export interface BundleUploadProgress {
  bytesSent: number;
  totalBytes: number;
  elapsedMs: number;
  rateBps: number;
  etaMs: number | null;
}

export type BundleUploadAbortReason = "stall" | "budget" | "slow" | "cancelled" | "error";

export interface BundleUploadResult {
  ok: boolean;
  detail?: string;
  bytesSent?: number;
  aborted?: boolean;
  reason?: BundleUploadAbortReason;
}

export interface LinkProbeResult {
  ok: boolean;
  rttMs: number;
  throughputBps: number;
  detail?: string;
}

export function bundleUploadLimitsFromConfig(
  rv: { bundleUploadBudgetSecs?: number; bundleUploadStallSecs?: number } | undefined,
): BundleUploadLimits {
  const budgetSecs = rv?.bundleUploadBudgetSecs ?? DEFAULT_BUNDLE_UPLOAD_BUDGET_SECS;
  const stallSecs = rv?.bundleUploadStallSecs ?? DEFAULT_BUNDLE_UPLOAD_STALL_SECS;
  return {
    budgetMs: Math.max(5, budgetSecs) * 1000,
    stallMs: Math.max(5, stallSecs) * 1000,
  };
}

/** SSH argv shared by upload, probes, and remote exec (#0917 ServerAlive). */
export function sshTransferArgs(host: BundleUploadHost): string[] {
  return [
    ...(host.keyPath ? ["-i", host.keyPath] : []),
    "-o",
    "BatchMode=yes",
    "-o",
    "StrictHostKeyChecking=accept-new",
    "-o",
    "ConnectTimeout=15",
    "-o",
    "ServerAliveInterval=15",
    "-o",
    "ServerAliveCountMax=4",
    "-o",
    "UserKnownHostsFile=/dev/null",
    "-o",
    "LogLevel=ERROR",
  ];
}

let uploadChain: Promise<void> = Promise.resolve();

/** One bundle upload at a time from this machine (#0917). */
export function withSerializedBundleUpload<T>(fn: () => Promise<T>): Promise<T> {
  const run = uploadChain.then(() => fn());
  uploadChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export interface UploadFileOverSshOptions {
  limits: BundleUploadLimits;
  onProgress?: (p: BundleUploadProgress) => void;
  registerAbort?: (abort: () => void) => void;
  /** Abort when ETA exceeds remaining budget at measured rate (#0917). */
  abortWhenEtaExceedsBudget?: boolean;
  /** Vitest-only: replace `spawn` for the ssh child. */
  _spawnForTest?: (command: string, args: string[], options: SpawnOptions) => ChildProcess;
}

/**
 * Stream `localPath` to `remotePath` via `ssh host cat > remotePath`.
 * Reports progress from bytes accepted into the local SSH stdin pipe.
 */
export async function uploadFileOverSsh(
  host: BundleUploadHost,
  localPath: string,
  remotePath: string,
  opts: UploadFileOverSshOptions,
): Promise<BundleUploadResult> {
  return withSerializedBundleUpload(() => doUploadFileOverSsh(host, localPath, remotePath, opts));
}

async function doUploadFileOverSsh(
  host: BundleUploadHost,
  localPath: string,
  remotePath: string,
  opts: UploadFileOverSshOptions,
): Promise<BundleUploadResult> {
  let totalBytes = 0;
  try {
    totalBytes = statSync(localPath).size;
  } catch (e) {
    return { ok: false, detail: `cannot read bundle: ${(e as Error).message}`, reason: "error" };
  }

  const startedAt = Date.now();
  let bytesSent = 0;
  let lastProgressAt = startedAt;
  let settled = false;
  let abortReason: BundleUploadAbortReason | undefined;
  let abortDetail: string | undefined;
  let child: ChildProcess | undefined;
  let readStream: ReturnType<typeof createReadStream> | undefined;
  let resolveOnce: ((r: BundleUploadResult) => void) | undefined;

  const finish = (result: BundleUploadResult): void => {
    if (settled) return;
    settled = true;
    clearInterval(stallWatch);
    clearTimeout(budgetTimer);
    resolveOnce?.(result);
  };

  const abort = (reason: BundleUploadAbortReason, detail: string): void => {
    if (settled) return;
    abortReason = reason;
    abortDetail = detail;
    try {
      child?.kill("SIGKILL");
    } catch {
      /* best effort */
    }
    try {
      readStream?.destroy();
    } catch {
      /* best effort */
    }
  };

  const emitProgress = (): void => {
    const elapsedMs = Date.now() - startedAt;
    const rateBps = elapsedMs > 0 ? Math.round((bytesSent * 1000) / elapsedMs) : 0;
    const remaining = totalBytes - bytesSent;
    const etaMs = rateBps > 0 && remaining > 0 ? Math.round((remaining * 1000) / rateBps) : null;
    opts.onProgress?.({ bytesSent, totalBytes, elapsedMs, rateBps, etaMs });
    if (
      opts.abortWhenEtaExceedsBudget &&
      etaMs !== null &&
      etaMs + elapsedMs > opts.limits.budgetMs &&
      bytesSent > 0 &&
      bytesSent < totalBytes
    ) {
      abort(
        "slow",
        `upload too slow (ETA ${Math.round(etaMs / 1000)}s exceeds budget) — trying another host or local gate`,
      );
    }
  };

  const stallWatch = setInterval(() => {
    if (settled) return;
    if (bytesSent >= totalBytes) return;
    if (Date.now() - lastProgressAt >= opts.limits.stallMs) {
      abort("stall", `upload stalled (no progress for ${Math.round(opts.limits.stallMs / 1000)}s)`);
    }
  }, 1000);
  stallWatch.unref?.();

  const budgetTimer = setTimeout(() => {
    if (settled) return;
    if (bytesSent >= totalBytes) return;
    abort("budget", `upload timed out after ${Math.round(opts.limits.budgetMs / 1000)}s`);
  }, opts.limits.budgetMs);
  budgetTimer.unref?.();

  opts.registerAbort?.(() => abort("cancelled", "upload cancelled"));

  return new Promise<BundleUploadResult>((resolve) => {
    resolveOnce = resolve;
    const spawnFn = opts._spawnForTest ?? spawn;
    child = spawnFn(
      "ssh",
      [...sshTransferArgs(host), `${host.user}@${host.ip}`, `cat > ${remotePath}`],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let output = "";
    const onData = (b: Buffer): void => {
      output += b.toString("utf8");
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("error", (e) => {
      finish({
        ok: false,
        detail: `ssh spawn failed: ${(e as Error).message}`,
        bytesSent,
        reason: "error",
      });
    });
    child.on("close", (code) => {
      if (abortReason) {
        finish({
          ok: false,
          detail: abortDetail ?? output.trim() ?? `upload aborted (${abortReason})`,
          bytesSent,
          aborted: true,
          reason: abortReason,
        });
        return;
      }
      if (code === 0 && bytesSent >= totalBytes) {
        finish({ ok: true, bytesSent });
        return;
      }
      finish({
        ok: false,
        detail:
          output.trim() || `ssh exited ${code ?? "null"} after ${bytesSent}/${totalBytes} bytes`,
        bytesSent,
        reason: "error",
      });
    });

    const stdin = child.stdin;
    if (!stdin) {
      finish({ ok: false, detail: "ssh stdin missing", reason: "error" });
      return;
    }

    stdin.on("error", (raw) => {
      const err = raw as NodeJS.ErrnoException;
      finish({
        ok: false,
        detail: `[stdin error: ${err.code ?? err.message}]`,
        bytesSent,
        reason: "error",
      });
    });

    readStream = createReadStream(localPath, { highWaterMark: CHUNK_BYTES });
    readStream.on("data", (chunk: Buffer | string) => {
      const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      if (settled) return;
      const canWrite = stdin.write(buf);
      bytesSent += buf.length;
      lastProgressAt = Date.now();
      emitProgress();
      if (!canWrite) readStream?.pause();
    });
    stdin.on("drain", () => readStream?.resume());
    readStream.on("error", (e) => {
      finish({
        ok: false,
        detail: `read bundle failed: ${(e as Error).message}`,
        bytesSent,
        reason: "error",
      });
    });
    readStream.on("end", () => {
      if (!settled) stdin.end();
    });
  });
}

/** Human-readable upload line for the close-out card (#0917). */
export function formatBundleUploadDetail(params: {
  hostLabel: string;
  bytesSent: number;
  totalBytes: number;
  rateBps: number;
  etaSecs: number | null;
  attempt: number;
  stageElapsedSecs: number;
  partial?: boolean;
  fullBundleNote?: string;
}): string {
  const pct =
    params.totalBytes > 0
      ? Math.min(100, Math.round((params.bytesSent * 100) / params.totalBytes))
      : 0;
  const rate =
    params.rateBps >= 1024 * 1024
      ? `${(params.rateBps / (1024 * 1024)).toFixed(1)} MB/s`
      : params.rateBps >= 1024
        ? `${Math.round(params.rateBps / 1024)} KB/s`
        : `${params.rateBps} B/s`;
  const eta =
    params.etaSecs !== null && params.etaSecs > 0
      ? ` · ~${formatSecsShort(params.etaSecs)} left`
      : "";
  const kind = params.fullBundleNote
    ? ` · ${params.fullBundleNote}`
    : params.partial
      ? " · incremental"
      : "";
  return (
    `uploading bundle to ${params.hostLabel} · ` +
    `${formatBytesShort(params.bytesSent)} / ${formatBytesShort(params.totalBytes)} (${pct}%) · ` +
    `${rate}${eta} · attempt ${params.attempt} · ${params.stageElapsedSecs}s in stage${kind}`
  );
}

function formatBytesShort(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let v = bytes / 1024;
  let u = units[0]!;
  for (let i = 1; v >= 1024 && i < units.length; i++) {
    v /= 1024;
    u = units[i]!;
  }
  return `${v >= 10 ? Math.round(v) : v.toFixed(1)} ${u}`;
}

function formatSecsShort(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

/** Conservative upload size when choosing local vs remote (#0917). */
export const INCREMENTAL_BUNDLE_BYTES_ESTIMATE = 2 * 1024 * 1024;
export const FULL_BUNDLE_BYTES_ESTIMATE = 100 * 1024 * 1024;

export function estimateCandidateUploadBytes(incrementalUpload: boolean): number {
  return incrementalUpload ? INCREMENTAL_BUNDLE_BYTES_ESTIMATE : FULL_BUNDLE_BYTES_ESTIMATE;
}

/** True when the laptop is healthy enough to run the gate locally (#0917 / #0918). */
export function localPressureOkForLocalGate(config: RepoOSConfig): boolean {
  return pressureReason(config) === null;
}

/** `last_close_out_gate_ms` from the task file, when recorded (#0917). */
export function readLastCloseOutGateMs(
  root: string,
  workDir: string | undefined,
  taskId: string,
): number | null {
  const dir = join(root, workDir ?? "work");
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  const name = entries.find((f) => f.startsWith(`${taskId}-`) && f.endsWith(".md"));
  if (!name) return null;
  try {
    const { data } = parseDocument(readFileSync(join(dir, name), "utf8"));
    const raw = data.last_close_out_gate_ms;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw === "string" && /^\d+$/.test(raw.trim())) return parseInt(raw.trim(), 10);
  } catch {
    return null;
  }
  return null;
}

/**
 * Whether to skip remote upload and run the gate locally (#0917).
 */
export function shouldPreferLocalGate(params: {
  forceMeteredLocal: boolean;
  probe: LinkProbeResult | null;
  bundleBytes: number;
  localGateMs: number | null;
  remoteGateMs: number | null;
  localPressureOk: boolean;
}): { prefer: boolean; detail?: string } {
  if (params.forceMeteredLocal && params.localPressureOk) {
    return { prefer: true, detail: "slow or metered link (setting): running locally" };
  }
  const probe = params.probe;
  if (!probe?.ok) return { prefer: false };
  if (probe.rttMs > HIGH_RTT_MS && params.localPressureOk) {
    return {
      prefer: true,
      detail: `high latency to runner (${probe.rttMs} ms RTT): running locally`,
    };
  }
  if (probe.throughputBps > 0 && params.bundleBytes > 0) {
    const uploadSecs = params.bundleBytes / probe.throughputBps;
    const remoteMs = (params.remoteGateMs ?? 0) + uploadSecs * 1000;
    const localMs = params.localGateMs ?? remoteMs;
    if (uploadSecs > SLOW_UPLOAD_BUDGET_SECS && params.localPressureOk) {
      const mbps = (probe.throughputBps * 8) / (1024 * 1024);
      return {
        prefer: true,
        detail: `slow uplink ${mbps.toFixed(1)} Mbps: running locally`,
      };
    }
    if (localMs > 0 && remoteMs > localMs * 1.2 && params.localPressureOk) {
      return { prefer: true, detail: "upload + remote gate slower than local: running locally" };
    }
  }
  return { prefer: false };
}

/** Floor for link probe throughput — below this, skip the host (#0917). */
export const LINK_THROUGHPUT_FLOOR_BPS = 200 * 1024;

export function linkProbeAcceptable(probe: LinkProbeResult): boolean {
  return probe.ok && probe.throughputBps >= LINK_THROUGHPUT_FLOOR_BPS;
}

/**
 * RTT via `ssh true` and throughput via a small stdin transfer to `/dev/null`.
 * `runLocal` is injected so tests avoid real SSH.
 */
export async function probeHostLink(
  host: BundleUploadHost,
  run: (
    cmd: string,
    args: string[],
    opts: { timeoutMs: number; stdin?: Buffer },
  ) => Promise<{ code: number | null; output: string; timedOut: boolean }>,
): Promise<LinkProbeResult> {
  const rttStart = Date.now();
  const echo = await run("ssh", [...sshTransferArgs(host), `${host.user}@${host.ip}`, "true"], {
    timeoutMs: 20_000,
  });
  const rttMs = Date.now() - rttStart;
  if (echo.code !== 0 || echo.timedOut) {
    return {
      ok: false,
      rttMs,
      throughputBps: 0,
      detail: echo.timedOut ? "link probe timed out" : tail(echo.output),
    };
  }
  const payload = Buffer.alloc(LINK_PROBE_BYTES, 0x61);
  const xferStart = Date.now();
  const xfer = await run(
    "ssh",
    [...sshTransferArgs(host), `${host.user}@${host.ip}`, "cat > /dev/null"],
    { timeoutMs: 30_000, stdin: payload },
  );
  const xferMs = Date.now() - xferStart;
  if (xfer.code !== 0 || xfer.timedOut) {
    return {
      ok: false,
      rttMs,
      throughputBps: 0,
      detail: xfer.timedOut ? "link throughput probe timed out" : tail(xfer.output),
    };
  }
  const throughputBps = xferMs > 0 ? Math.round((payload.length * 1000) / xferMs) : 0;
  return { ok: true, rttMs, throughputBps };
}

function tail(s: string): string {
  const lines = s.trim().split("\n").filter(Boolean);
  return lines.length ? lines[lines.length - 1]! : s.trim();
}

/** Test helper: run a local `ssh` with optional stdin (wraps spawn). */
export async function runSshForProbe(
  cmd: string,
  args: string[],
  opts: { timeoutMs: number; stdin?: Buffer },
): Promise<{ code: number | null; output: string; timedOut: boolean }> {
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
    child.stdout?.on("data", (b) => {
      output += b.toString("utf8");
    });
    child.stderr?.on("data", (b) => {
      output += b.toString("utf8");
    });
    child.on("error", (e) => {
      output += (e as Error).message;
      done(null);
    });
    child.on("close", (code) => done(code));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, opts.timeoutMs);
    if (opts.stdin) {
      writeChildStdin(child, opts.stdin, {
        command: cmd,
        end: true,
        onError: (e) => {
          output += `\n[stdin error: ${e.message}]\n`;
          done(null);
        },
      });
    } else {
      child.stdin?.end();
    }
  });
}
