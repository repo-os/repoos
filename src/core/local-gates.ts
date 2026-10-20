import type { RepoOSConfig } from "./types.js";
import {
  acquireCrossProcessSlot,
  acquireLocalFallbackSerializeSlot,
  localCheckLockRoot,
  playwrightLockRoot,
  SlotQueueTimeoutError,
} from "./cross-process-slots.js";
import {
  localCheckLimitForRun,
  localChecksQueueTimeoutMs,
  playwrightMaxConcurrent,
  playwrightQueueTimeoutMs,
  remoteLocalFallbackMode,
} from "./resource-limits.js";
import { waitForPressureRelief } from "./pressure-guard.js";
import { clearQueueMarker, writeQueueMarker, type LocalQueueKind } from "./local-queue-marker.js";
import { mainCheckoutRoot } from "./git.js";

export { SlotQueueTimeoutError };

function boardRoot(repoRoot: string): string {
  try {
    return mainCheckoutRoot(repoRoot);
  } catch {
    return repoRoot;
  }
}

function taskIdFromEnv(env: NodeJS.ProcessEnv): string | null {
  const id = env.REPOOS_TASK_ID?.trim() || env.REPOOS_CHECK_TASK_ID?.trim();
  return id && /^\d+$/.test(id) ? id : null;
}

function markQueue(
  repoRoot: string,
  cacheDir: string,
  env: NodeJS.ProcessEnv,
  kind: LocalQueueKind,
  ahead: number,
  position: number,
  message: string,
): void {
  const taskId = taskIdFromEnv(env);
  if (!taskId) return;
  writeQueueMarker(boardRoot(repoRoot), cacheDir, {
    taskId,
    kind,
    ahead,
    position,
    message,
    since: new Date().toISOString(),
  });
}

function unmarkQueue(
  repoRoot: string,
  cacheDir: string,
  env: NodeJS.ProcessEnv,
  kind: LocalQueueKind,
): void {
  const taskId = taskIdFromEnv(env);
  if (!taskId) return;
  clearQueueMarker(boardRoot(repoRoot), cacheDir, taskId, kind);
}

function isRemoteLocalFallbackRun(env: NodeJS.ProcessEnv): boolean {
  return (
    Boolean(env.REPOOS_REMOTE_FALLBACK_DETAIL?.trim()) || env.REPOOS_LOCAL_FALLBACK_RUN === "1"
  );
}

function isSerializeFallbackRun(config: RepoOSConfig, env: NodeJS.ProcessEnv): boolean {
  return isRemoteLocalFallbackRun(env) && remoteLocalFallbackMode(config) === "serialize";
}

export interface AcquireLocalCheckSlotOpts {
  repoRoot: string;
  config: RepoOSConfig;
  env: NodeJS.ProcessEnv;
  onStatusLine?: (line: string) => void;
  skipPressure?: boolean;
}

/**
 * Wait for pressure relief, then take a cross-process local-check slot (#0836).
 */
export async function acquireLocalCheckSlot(opts: AcquireLocalCheckSlotOpts): Promise<() => void> {
  if (opts.env.REPOOS_LOCAL_CHECK_SLOT_HELD === "1") {
    return () => {};
  }
  const limit = isSerializeFallbackRun(opts.config, opts.env)
    ? 1
    : localCheckLimitForRun(opts.config, opts.env);
  if (limit <= 0) {
    throw new Error(
      "remote validation fell back locally but remoteValidation.localFallback is off — " +
        "enable fallback or fix the runner instead of running the full gate here",
    );
  }
  const cacheDir = opts.config.cacheDir ?? ".repoos";
  const waitMs = localChecksQueueTimeoutMs(opts.config);
  const board = boardRoot(opts.repoRoot);
  const emit = (line: string) => opts.onStatusLine?.(line);

  if (!opts.skipPressure) {
    await waitForPressureRelief(opts.config, {
      onWaiting: (reason) => {
        emit(`[pressure] ${reason}`);
        markQueue(board, cacheDir, opts.env, "pressure", 0, 0, reason);
      },
    });
    unmarkQueue(board, cacheDir, opts.env, "pressure");
  }

  let releaseSerialize: (() => void) | null = null;
  if (isSerializeFallbackRun(opts.config, opts.env)) {
    releaseSerialize = await acquireLocalFallbackSerializeSlot(board, cacheDir, waitMs, (ahead) => {
      const position = ahead + 1;
      const msg =
        ahead === 0
          ? "waiting for serialized local fallback slot"
          : `waiting for serialized local fallback (${ahead} ahead, position ${position})`;
      emit(`[queue] ${msg}`);
      markQueue(board, cacheDir, opts.env, "local-check", ahead, position, msg);
    });
  }

  try {
    const releaseCheck = await acquireCrossProcessSlot({
      slots: limit,
      lockRoot: localCheckLockRoot(board, cacheDir),
      waitTimeoutMs: waitMs,
      meta: {
        kind: "local-check",
        pid: process.pid,
        taskId: taskIdFromEnv(opts.env),
      },
      onQueued: (ahead, position) => {
        const msg =
          ahead === 0
            ? "waiting for a local check slot"
            : `waiting for a local check slot (${ahead} ahead, position ${position})`;
        emit(`[queue] ${msg}`);
        markQueue(board, cacheDir, opts.env, "local-check", ahead, position, msg);
      },
    });

    unmarkQueue(board, cacheDir, opts.env, "local-check");

    return () => {
      releaseCheck();
      releaseSerialize?.();
    };
  } catch (err) {
    releaseSerialize?.();
    throw err;
  }
}

export async function acquirePlaywrightSlot(
  repoRoot: string,
  config: RepoOSConfig,
  env: NodeJS.ProcessEnv,
  onStatusLine?: (line: string) => void,
  opts: { skipPressure?: boolean } = {},
): Promise<() => void> {
  const cacheDir = config.cacheDir ?? ".repoos";
  const board = boardRoot(repoRoot);
  const limit = playwrightMaxConcurrent(config);
  const waitMs = playwrightQueueTimeoutMs(config);
  const emit = (line: string) => onStatusLine?.(line);

  // Browser work is the heaviest thing RepoOS starts on a laptop. Hold it
  // while pressure is critical (#0871); the slot queue alone cannot see swap.
  if (!opts.skipPressure) {
    await waitForPressureRelief(config, {
      onWaiting: (reason) => {
        emit(`[pressure] ${reason}`);
        markQueue(board, cacheDir, env, "pressure", 0, 0, reason);
      },
    });
    unmarkQueue(board, cacheDir, env, "pressure");
  }

  return acquireCrossProcessSlot({
    slots: limit,
    lockRoot: playwrightLockRoot(board, cacheDir),
    waitTimeoutMs: waitMs,
    meta: { kind: "playwright", pid: process.pid, taskId: taskIdFromEnv(env) },
    onQueued: (ahead, position) => {
      const msg =
        ahead === 0
          ? `waiting for a Playwright slot (${limit} max)`
          : `waiting for a Playwright slot — position ${position} (${ahead} ahead)`;
      emit(`[queue] ${msg}`);
      markQueue(board, cacheDir, env, "playwright", ahead, position, msg);
    },
  }).then((release) => {
    unmarkQueue(board, cacheDir, env, "playwright");
    return () => {
      release();
    };
  });
}
