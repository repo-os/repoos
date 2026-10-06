/**
 * Persisted CTO safe-action rate windows (#0688).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CtoSafeActionId } from "../core/cto-actions.js";
import { ctoActionRateScopeKey } from "../core/cto-actions.js";

const FILE = "cto-action-rates.json";
const WINDOW_MS = 60 * 60 * 1000;

type StoreShape = Record<string, string[]>;

export interface CtoActionRateStore {
  countRecent(action: CtoSafeActionId, taskId: string | null): number;
  record(action: CtoSafeActionId, taskId: string | null, at?: string): void;
}

function scopeKey(action: CtoSafeActionId, taskId: string | null): string {
  return `${action}:${ctoActionRateScopeKey(action, taskId)}`;
}

export function createCtoActionRateStore(
  root: string,
  cacheDir: string = ".repoos",
): CtoActionRateStore {
  const path = join(root, cacheDir, FILE);
  let data: StoreShape | null = null;

  function load(): StoreShape {
    if (data) return data;
    if (!existsSync(path)) {
      data = {};
      return data;
    }
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
      data = parsed && typeof parsed === "object" ? (parsed as StoreShape) : {};
    } catch {
      data = {};
    }
    return data;
  }

  function persist(next: StoreShape): void {
    try {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify(next, null, 2), "utf8");
      data = next;
    } catch {
      /* best-effort */
    }
  }

  function prune(times: string[], now: number): string[] {
    return times.filter((t) => {
      const at = Date.parse(t);
      return Number.isFinite(at) && now - at < WINDOW_MS;
    });
  }

  return {
    countRecent(action, taskId) {
      const key = scopeKey(action, taskId);
      const now = Date.now();
      const times = prune(load()[key] ?? [], now);
      return times.length;
    },
    record(action, taskId, at) {
      const key = scopeKey(action, taskId);
      const stamp = at ?? new Date().toISOString();
      const now = Date.now();
      const store = { ...load() };
      const times = prune(store[key] ?? [], now);
      times.push(stamp);
      store[key] = times;
      persist(store);
    },
  };
}
