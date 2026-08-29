/**
 * Repository-level locks for mutual exclusion on the main checkout.
 *
 * The close-out lock serializes publication to main, and the root lock
 * additionally prevents a hotfix from running while a close-out holds the
 * main checkout. Both locks share a single file to keep acquisition atomic.
 */

import { existsSync, writeFileSync, unlinkSync, mkdirSync, statSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";

const LOCK_FILE = ".repoos/close-out.lock";
const ROOT_LOCK_FILE = ".repoos/root.lock";

export interface RepositoryLock {
  /** Acquire the lock. Returns true if successful, false if already held. */
  acquire(taskId: string): boolean;

  /** Release the lock if held by this task. */
  release(taskId: string): boolean;

  /** Check if the lock is currently held. */
  isLocked(): boolean;

  /** Get the ID of the task holding the lock, or null if not locked. */
  getHolder(): string | null;
}

export function createRepositoryLock(root: string): RepositoryLock {
  return {
    acquire(taskId: string): boolean {
      const lockPath = join(root, LOCK_FILE);
      if (existsSync(lockPath)) {
        try {
          const stat = statSync(lockPath);
          const age = Date.now() - stat.mtime.getTime();
          if (age > 60_000) {
            unlinkSync(lockPath);
          } else {
            return false;
          }
        } catch {
          return false;
        }
      }
      try {
        mkdirSync(dirname(lockPath), { recursive: true });
        writeFileSync(lockPath, JSON.stringify({ taskId, acquiredAt: new Date().toISOString() }));
        return true;
      } catch {
        return false;
      }
    },

    release(taskId: string): boolean {
      const lockPath = join(root, LOCK_FILE);
      try {
        if (existsSync(lockPath)) {
          const content = readFileSync(lockPath, "utf8");
          const lock = JSON.parse(content);
          if (lock.taskId === taskId) {
            unlinkSync(lockPath);
            return true;
          }
        }
      } catch {
        /* ignore */
      }
      return false;
    },

    isLocked(): boolean {
      const lockPath = join(root, LOCK_FILE);
      return existsSync(lockPath);
    },

    getHolder(): string | null {
      const lockPath = join(root, LOCK_FILE);
      try {
        if (existsSync(lockPath)) {
          const content = readFileSync(lockPath, "utf8");
          const lock = JSON.parse(content);
          return lock.taskId || null;
        }
      } catch {
        /* ignore */
      }
      return null;
    },
  };
}

/**
 * Root lock: prevents a hotfix and a close-out from holding the main checkout
 * at the same time. Both must acquire this lock before touching root.
 */
export interface RootLock {
  /** Try to acquire the root lock for a task. Returns true on success. */
  acquire(taskId: string, kind: "hotfix" | "close-out"): boolean;
  /** Release the root lock if held by this task. */
  release(taskId: string): boolean;
  /** Whether the root lock is currently held. */
  isLocked(): boolean;
  /** Get the holder info, or null. */
  getHolder(): { taskId: string; kind: "hotfix" | "close-out" } | null;
}

export function createRootLock(root: string): RootLock {
  const lockPath = join(root, ROOT_LOCK_FILE);

  return {
    acquire(taskId: string, kind: "hotfix" | "close-out"): boolean {
      if (existsSync(lockPath)) {
        try {
          const stat = statSync(lockPath);
          const age = Date.now() - stat.mtime.getTime();
          // Hotfix holds last indefinitely (until finalization), so use a
          // longer stale window (10 min) to avoid crashing a live hotfix.
          if (age > 600_000) {
            unlinkSync(lockPath);
          } else {
            return false;
          }
        } catch {
          return false;
        }
      }
      try {
        mkdirSync(dirname(lockPath), { recursive: true });
        writeFileSync(
          lockPath,
          JSON.stringify({ taskId, kind, acquiredAt: new Date().toISOString() }),
        );
        return true;
      } catch {
        return false;
      }
    },

    release(taskId: string): boolean {
      try {
        if (existsSync(lockPath)) {
          const content = readFileSync(lockPath, "utf8");
          const lock = JSON.parse(content);
          if (lock.taskId === taskId) {
            unlinkSync(lockPath);
            return true;
          }
        }
      } catch {
        /* ignore */
      }
      return false;
    },

    isLocked(): boolean {
      return existsSync(lockPath);
    },

    getHolder(): { taskId: string; kind: "hotfix" | "close-out" } | null {
      try {
        if (existsSync(lockPath)) {
          const content = readFileSync(lockPath, "utf8");
          const lock = JSON.parse(content);
          const kind =
            lock.kind === "hotfix" || lock.kind === "close-out" ? lock.kind : "close-out";
          return { taskId: lock.taskId, kind };
        }
      } catch {
        /* ignore */
      }
      return null;
    },
  };
}
