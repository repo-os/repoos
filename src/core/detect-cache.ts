/**
 * Thin read/write cache for the agent detection results. Stored as a single
 * JSON file in the repo's `.repoos/` directory so results survive server
 * restarts and load instantly on the next page visit.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import type { DetectedAgent } from "./detect.js";

export interface DetectCache {
  /** ISO timestamp of when the detection ran. */
  cachedAt: string;
  agents: DetectedAgent[];
}

function cachePath(root: string, cacheDir: string): string {
  return join(root, cacheDir, "detect-cache.json");
}

export function readDetectCache(root: string, cacheDir: string): DetectCache | null {
  try {
    const raw = readFileSync(cachePath(root, cacheDir), "utf8");
    return JSON.parse(raw) as DetectCache;
  } catch {
    return null;
  }
}

export function writeDetectCache(root: string, cacheDir: string, agents: DetectedAgent[]): void {
  try {
    const p = cachePath(root, cacheDir);
    mkdirSync(dirname(p), { recursive: true });
    const payload: DetectCache = { cachedAt: new Date().toISOString(), agents };
    writeFileSync(p, JSON.stringify(payload), "utf8");
  } catch {
    // Cache write failure is non-fatal.
  }
}
