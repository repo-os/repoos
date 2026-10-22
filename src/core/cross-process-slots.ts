import {
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  utimesSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
export const STALE_MS = 90 * 1000;
export const WEDGED_AFTER_MS = 75 * 1000;
export const WEDGED_RECLAIM_AFTER_MS = 150 * 1000;
const HEARTBEAT_MS = 15_000;

function processIsAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  if (process.platform !== "win32") {
    const result = spawnSync("ps", ["-o", "stat=", "-p", String(pid)], {
      encoding: "utf8",
      timeout: 1_000,
    });
    if (result.status === 0 && result.stdout.trim()) {
      return !result.stdout.trim().startsWith("Z");
    }
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

function processStartToken(pid: number): string | undefined {
  if (process.platform === "win32") return undefined;
  const result = spawnSync("ps", ["-o", "lstart=", "-p", String(pid)], {
    encoding: "utf8",
    timeout: 1_000,
  });
  return result.status === 0 && result.stdout.trim() ? result.stdout.trim() : undefined;
}

function monotonicMs(): number {
  return Number(process.hrtime.bigint() / 1_000_000n);
}

function processGroupHasLiveMembers(pgid: number): boolean {
  if (process.platform !== "win32") {
    const result = spawnSync("ps", ["-axo", "pgid=,stat="], {
      encoding: "utf8",
      timeout: 1_000,
    });
    if (result.status === 0) {
      return result.stdout.split(/\r?\n/).some((line) => {
        const [group, state] = line.trim().split(/\s+/, 2);
        return Number(group) === pgid && Boolean(state) && !state.startsWith("Z");
      });
    }
  }
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

function terminateHolder(dir: string): boolean {
  if (process.platform === "win32") return false;
  try {
    const meta = JSON.parse(readFileSync(join(dir, ".meta.json"), "utf8")) as Record<
      string,
      unknown
    >;
    const pid = Number(readFileSync(join(dir, ".holder"), "utf8"));
    if (meta.kind !== "local-check") return true;
    if (!Number.isInteger(pid) || pid <= 0) return false;
    const target = meta.processGroup === true ? -pid : pid;
    const alive = () =>
      meta.processGroup === true ? processGroupHasLiveMembers(pid) : processIsAlive(pid);
    try {
      process.kill(target, "SIGTERM");
    } catch {
      return !alive();
    }
    const wait = new Int32Array(new SharedArrayBuffer(4));
    const deadline = Date.now() + 2_000;
    while (Date.now() < deadline && alive()) Atomics.wait(wait, 0, 0, 100);
    if (alive()) {
      try {
        process.kill(target, "SIGKILL");
      } catch {
        /* group exited */
      }
      const killDeadline = Date.now() + 2_000;
      while (Date.now() < killDeadline && alive()) Atomics.wait(wait, 0, 0, 100);
    }
    return !alive();
  } catch {
    return false;
  }
}

export class SlotQueueTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SlotQueueTimeoutError";
  }
}

export interface SlotAcquireOptions {
  slots: number;
  lockRoot: string;
  waitTimeoutMs: number;
  /** Written into the slot dir for debugging and stale recovery. */
  meta?: Record<string, unknown>;
  onQueued?: (ahead: number, position: number) => void;
  onHeartbeat?: () => void;
  staleAfterMs?: number;
  reclaimGraceMs?: number;
}

function slotDirs(lockRoot: string): string[] {
  try {
    return readdirSync(lockRoot)
      .filter((n) => /^\d+$/.test(n))
      .map((n) => join(lockRoot, String(n)));
  } catch {
    return [];
  }
}

function isStaleSlot(
  dir: string,
  staleAfterMs = WEDGED_AFTER_MS,
  reclaimGraceMs = WEDGED_RECLAIM_AFTER_MS,
): boolean {
  // A slot's recorded owner is authoritative when its process has exited;
  // heartbeat timestamps alone can leave a dead close-out blocking for 30m.
  try {
    const rawPid = readFileSync(join(dir, ".holder"), "utf8").trim();
    if (/^\d+$/.test(rawPid)) {
      const pid = Number(rawPid);
      if (!processIsAlive(pid)) return true;
      try {
        const meta = JSON.parse(readFileSync(join(dir, ".meta.json"), "utf8")) as Record<
          string,
          unknown
        >;
        const recorded =
          typeof meta.processStartToken === "string" ? meta.processStartToken : undefined;
        const current = processStartToken(pid);
        if (recorded && current && recorded !== current) return true;
      } catch {
        /* identity metadata may be absent in older slot dirs */
      }
    }
  } catch {
    // A slot without holder metadata may be mid-creation; use its age below.
  }
  try {
    const st = statSync(dir);
    let age = Date.now() - st.mtimeMs;
    try {
      const heartbeat = JSON.parse(readFileSync(join(dir, ".heartbeat.json"), "utf8")) as {
        monotonicMs?: number;
      };
      if (Number.isFinite(heartbeat.monotonicMs))
        age = Math.max(0, monotonicMs() - heartbeat.monotonicMs!);
    } catch {
      /* older slot dirs use filesystem time */
    }
    if (age > staleAfterMs) {
      const marker = join(dir, ".wedged-since");
      try {
        const since = Number(readFileSync(marker, "utf8"));
        if (Number.isFinite(since)) {
          if (monotonicMs() - since < reclaimGraceMs) return false;
          return terminateHolder(dir);
        }
      } catch {
        try {
          writeFileSync(marker, String(monotonicMs()), "utf8");
        } catch {
          /* concurrent release */
        }
      }
      return false;
    } else {
      try {
        rmSync(join(dir, ".wedged-since"), { force: true });
      } catch {
        /* best effort */
      }
    }
    return age > STALE_MS;
  } catch {
    return true;
  }
}

export interface LocalSlotHolder {
  slot: number;
  pid?: number;
  ageMs: number;
  heartbeatAgeMs: number;
  wedged: boolean;
  dead: boolean;
  meta?: Record<string, unknown>;
}

function holderIsDead(pid: number | undefined): boolean {
  if (!pid || !Number.isInteger(pid) || pid <= 0) return false;
  return !processIsAlive(pid);
}

/** Read local slot ownership for the Checks surface and CLI diagnostics. */
export function inspectCrossProcessSlots(
  lockRoot: string,
  slots?: number,
  staleAfterMs = WEDGED_AFTER_MS,
): LocalSlotHolder[] {
  const dirs = new Map(
    slotDirs(lockRoot).map((dir) => [Number(dir.slice(dir.lastIndexOf("/") + 1)), dir]),
  );
  const indexes =
    slots == null
      ? [...dirs.keys()].sort((a, b) => a - b)
      : Array.from({ length: slots }, (_, i) => i);
  return indexes.map((slot) => {
    const dir = dirs.get(slot);
    if (!dir) return { slot, ageMs: 0, heartbeatAgeMs: 0, wedged: false, dead: false };
    let pid: number | undefined;
    let meta: Record<string, unknown> | undefined;
    let ageMs = 0;
    let heartbeatAgeMs = 0;
    try {
      pid = Number(readFileSync(join(dir, ".holder"), "utf8")) || undefined;
      meta = JSON.parse(readFileSync(join(dir, ".meta.json"), "utf8")) as Record<string, unknown>;
      ageMs = Math.max(0, Date.now() - statSync(dir).mtimeMs);
      heartbeatAgeMs = ageMs;
      try {
        const heartbeat = JSON.parse(readFileSync(join(dir, ".heartbeat.json"), "utf8")) as {
          monotonicMs?: number;
        };
        if (Number.isFinite(heartbeat.monotonicMs))
          heartbeatAgeMs = Math.max(0, monotonicMs() - heartbeat.monotonicMs!);
        const started = JSON.parse(readFileSync(join(dir, ".started.json"), "utf8")) as {
          monotonicMs?: number;
        };
        if (Number.isFinite(started.monotonicMs))
          ageMs = Math.max(0, monotonicMs() - started.monotonicMs!);
      } catch {
        /* old slot dirs rely on mtime */
      }
    } catch {
      try {
        ageMs = Math.max(0, Date.now() - statSync(dir).mtimeMs);
      } catch {
        /* disappeared during inspection */
      }
    }
    return {
      slot: Number(dir.slice(dir.lastIndexOf("/") + 1)),
      pid,
      ageMs,
      heartbeatAgeMs,
      dead:
        holderIsDead(pid) ||
        Boolean(
          meta?.processStartToken &&
          processStartToken(pid ?? -1) &&
          meta.processStartToken !== processStartToken(pid ?? -1),
        ),
      wedged: !holderIsDead(pid) && heartbeatAgeMs > staleAfterMs,
      meta,
    };
  });
}

/** Release a named wedged slot only when the operator confirms its current PID. */
export function releaseLocalCheckSlot(
  lockRoot: string,
  slot: number,
  confirmedPid: number,
): LocalSlotHolder {
  const holder = inspectCrossProcessSlots(lockRoot, slot + 1).find((item) => item.slot === slot);
  if (!holder?.pid || holder.pid !== confirmedPid)
    throw new Error("slot holder changed; inspect slots and retry");
  if (!holder.dead && !holder.wedged)
    throw new Error(`slot ${slot} is held by live PID ${holder.pid} and is not wedged`);
  const dir = join(lockRoot, String(slot));
  if (holder.dead) {
    rmSync(dir, { recursive: true, force: true });
    return holder;
  }
  if (!terminateHolder(dir))
    throw new Error("holder did not exit after SIGTERM/SIGKILL; slot retained");
  rmSync(dir, { recursive: true, force: true });
  return holder;
}

/** Reap close-out check groups left behind after their candidate worktree vanished. */
export function reapOrphanedLocalCheckGroups(lockRoot: string): number[] {
  if (process.platform === "win32") return [];
  const reaped: number[] = [];
  for (const dir of slotDirs(lockRoot)) {
    try {
      const meta = JSON.parse(readFileSync(join(dir, ".meta.json"), "utf8")) as Record<
        string,
        unknown
      >;
      if (meta.kind !== "local-check" || meta.processGroup !== true) continue;
      const worktree = typeof meta.worktree === "string" ? meta.worktree : "";
      const pid = Number(readFileSync(join(dir, ".holder"), "utf8"));
      if (!worktree || existsSync(worktree) || !Number.isInteger(pid) || pid <= 0) continue;
      try {
        process.kill(-pid, "SIGTERM");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ESRCH") {
          rmSync(dir, { recursive: true, force: true });
          continue;
        }
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500);
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        /* the group exited during the grace period */
      }
      // Do not release the slot while any member of the old check group can
      // still be running. In particular, SIGKILL delivery is asynchronous;
      // deleting the lock immediately lets a retry overlap the orphan briefly.
      const waitArray = new Int32Array(new SharedArrayBuffer(4));
      const killDeadline = Date.now() + 2_000;
      let groupAlive = true;
      while (Date.now() < killDeadline) {
        if (!processGroupHasLiveMembers(pid)) {
          groupAlive = false;
          break;
        }
        Atomics.wait(waitArray, 0, 0, 100);
      }
      if (groupAlive) continue;
      rmSync(dir, { recursive: true, force: true });
      reaped.push(pid);
    } catch {
      /* malformed or concurrently released slot */
    }
  }
  return reaped;
}

function tryTakeSlot(
  lockRoot: string,
  slots: number,
  meta?: Record<string, unknown>,
  staleAfterMs?: number,
  reclaimGraceMs?: number,
): string | null {
  mkdirSync(lockRoot, { recursive: true });
  for (let i = 0; i < slots; i++) {
    const dir = join(lockRoot, String(i));
    if (existsSync(dir)) {
      if (isStaleSlot(dir, staleAfterMs, reclaimGraceMs)) {
        try {
          rmSync(dir, { recursive: true, force: true });
        } catch {
          continue;
        }
      } else {
        continue;
      }
    }
    try {
      mkdirSync(dir);
      if (meta) {
        writeFileSync(
          join(dir, ".meta.json"),
          JSON.stringify({ ...meta, processStartToken: processStartToken(process.pid) }),
          "utf8",
        );
      }
      writeFileSync(join(dir, ".holder"), String(process.pid), "utf8");
      writeFileSync(
        join(dir, ".heartbeat.json"),
        JSON.stringify({ wallMs: Date.now(), monotonicMs: monotonicMs() }),
        "utf8",
      );
      writeFileSync(
        join(dir, ".started.json"),
        JSON.stringify({ wallMs: Date.now(), monotonicMs: monotonicMs() }),
        "utf8",
      );
      return dir;
    } catch {
      /* contested */
    }
  }
  return null;
}

function countActiveSlots(
  lockRoot: string,
  staleAfterMs?: number,
  reclaimGraceMs?: number,
): number {
  return slotDirs(lockRoot).filter(
    (d) => existsSync(d) && !isStaleSlot(d, staleAfterMs, reclaimGraceMs),
  ).length;
}

/**
 * Portable counting semaphore using atomic `mkdir` (#0521 pattern, #0836).
 * Works across processes on one machine (standalone `repoos check` + server).
 */
export async function acquireCrossProcessSlot(opts: SlotAcquireOptions): Promise<() => void> {
  const slots = Math.max(1, Math.floor(opts.slots));
  if (slots <= 0) {
    throw new Error("local fallback is disabled (remoteValidation.localFallback = off)");
  }
  const started = Date.now();
  const deadline = started + Math.max(0, opts.waitTimeoutMs);
  let held: string | null = null;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const signalHandlers = new Map<NodeJS.Signals, () => void>();

  const release = (): void => {
    if (heartbeat) clearInterval(heartbeat);
    for (const [signal, handler] of signalHandlers) process.off(signal, handler);
    signalHandlers.clear();
    if (held) {
      try {
        rmSync(held, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
      held = null;
    }
  };

  while (!held) {
    held = tryTakeSlot(opts.lockRoot, slots, opts.meta, opts.staleAfterMs, opts.reclaimGraceMs);
    if (held) {
      for (const signal of ["SIGTERM", "SIGINT"] as const) {
        const handler = () => {
          release();
          process.off(signal, handler);
          process.kill(process.pid, signal);
        };
        signalHandlers.set(signal, handler);
        process.once(signal, handler);
      }
      heartbeat = setInterval(() => {
        try {
          const now = new Date();
          utimesSync(held!, now, now);
          writeFileSync(
            join(held!, ".heartbeat.json"),
            JSON.stringify({ wallMs: Date.now(), monotonicMs: monotonicMs() }),
            "utf8",
          );
          opts.onHeartbeat?.();
        } catch {
          /* slot gone */
        }
      }, HEARTBEAT_MS);
      heartbeat.unref?.();
      return release;
    }
    const active = countActiveSlots(opts.lockRoot, opts.staleAfterMs, opts.reclaimGraceMs);
    const ahead = Math.max(0, active);
    const position = ahead + 1;
    opts.onQueued?.(ahead, position);
    if (Date.now() >= deadline) {
      throw new SlotQueueTimeoutError(
        `timed out after ${Math.round((Date.now() - started) / 1000)}s waiting for a free slot ` +
          `(limit ${slots}) — another check or Playwright run may be stuck. ` +
          "Inspect running `repoos check` / Playwright processes, or raise localChecks / playwright limits in Settings.",
      );
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return release;
}

export function localCheckLockRoot(repoRoot: string, cacheDir: string): string {
  return join(repoRoot, cacheDir, "local-check-slots");
}

export function playwrightLockRoot(repoRoot: string, cacheDir: string): string {
  return join(repoRoot, cacheDir, "playwright-slots");
}

export function localFallbackSerializeLockRoot(repoRoot: string, cacheDir: string): string {
  return join(repoRoot, cacheDir, "local-fallback-serialize");
}

/** One global serialize slot for remote local-fallback runs. */
export async function acquireLocalFallbackSerializeSlot(
  repoRoot: string,
  cacheDir: string,
  waitTimeoutMs: number,
  onQueued?: (ahead: number) => void,
): Promise<() => void> {
  return acquireCrossProcessSlot({
    slots: 1,
    lockRoot: localFallbackSerializeLockRoot(repoRoot, cacheDir),
    waitTimeoutMs,
    meta: { kind: "local-fallback-serialize", id: randomBytes(4).toString("hex") },
    onQueued: (ahead) => onQueued?.(ahead),
  });
}
