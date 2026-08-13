/**
 * Simple repository-level lock for atomic publication. Used to serialize
 * close-out publication to main so only one job merges at a time.
 */

import { existsSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

const LOCK_FILE = ".repoos/close-out.lock";

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
        // Lock already exists, check if it's stale.
        // 60-second window balances crash recovery against long builds/checks.
        // Builds typically complete in 5-10s; if a job crashes, 60s gives retry window.
        try {
          const stat = require("fs").statSync(lockPath);
          const age = Date.now() - stat.mtime.getTime();
          if (age > 60_000) {
            // Stale lock, remove it
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
          const content = require("fs").readFileSync(lockPath, "utf8");
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
          const content = require("fs").readFileSync(lockPath, "utf8");
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
