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
const STALE_MS = 30 * 60 * 1000;
const HEARTBEAT_MS = 15_000;

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

function isStaleSlot(dir: string): boolean {
  // A slot's recorded owner is authoritative when its process has exited;
  // heartbeat timestamps alone can leave a dead close-out blocking for 30m.
  try {
    const rawPid = readFileSync(join(dir, ".holder"), "utf8").trim();
    if (/^\d+$/.test(rawPid)) {
      try {
        process.kill(Number(rawPid), 0);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ESRCH") return true;
      }
    }
  } catch {
    // A slot without holder metadata may be mid-creation; use its age below.
  }
  try {
    const st = statSync(dir);
    return Date.now() - st.mtimeMs > STALE_MS;
  } catch {
    return true;
  }
}

function tryTakeSlot(
  lockRoot: string,
  slots: number,
  meta?: Record<string, unknown>,
): string | null {
  mkdirSync(lockRoot, { recursive: true });
  for (let i = 0; i < slots; i++) {
    const dir = join(lockRoot, String(i));
    if (existsSync(dir)) {
      if (isStaleSlot(dir)) {
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
        writeFileSync(join(dir, ".meta.json"), JSON.stringify(meta), "utf8");
      }
      writeFileSync(join(dir, ".holder"), String(process.pid), "utf8");
      return dir;
    } catch {
      /* contested */
    }
  }
  return null;
}

function countActiveSlots(lockRoot: string): number {
  return slotDirs(lockRoot).filter((d) => existsSync(d) && !isStaleSlot(d)).length;
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

  const release = (): void => {
    if (heartbeat) clearInterval(heartbeat);
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
    held = tryTakeSlot(opts.lockRoot, slots, opts.meta);
    if (held) {
      heartbeat = setInterval(() => {
        try {
          const now = new Date();
          utimesSync(held!, now, now);
          opts.onHeartbeat?.();
        } catch {
          /* slot gone */
        }
      }, HEARTBEAT_MS);
      heartbeat.unref?.();
      return release;
    }
    const active = countActiveSlots(opts.lockRoot);
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
