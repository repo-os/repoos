import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type LocalQueueKind = "local-check" | "playwright" | "pressure";

export interface LocalQueueMarker {
  taskId: string;
  pid?: number;
  kind: LocalQueueKind;
  position: number;
  ahead: number;
  message: string;
  since: string;
  /** Slot pool being waited on; absent on older markers. */
  pool?: "local-check" | "local-fallback-serialize" | "playwright";
}

export function queueMarkersDir(repoRoot: string, cacheDir: string): string {
  return join(repoRoot, cacheDir, "queue-markers");
}

export function writeQueueMarker(
  repoRoot: string,
  cacheDir: string,
  marker: LocalQueueMarker,
): void {
  const dir = queueMarkersDir(repoRoot, cacheDir);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${marker.taskId}-${marker.kind}.json`);
  writeFileSync(file, JSON.stringify(marker), "utf8");
}

export function clearQueueMarker(
  repoRoot: string,
  cacheDir: string,
  taskId: string,
  kind: LocalQueueKind,
): void {
  const file = join(queueMarkersDir(repoRoot, cacheDir), `${taskId}-${kind}.json`);
  if (existsSync(file)) {
    try {
      rmSync(file);
    } catch {
      /* ignore */
    }
  }
}

export function readQueueMarkers(repoRoot: string, cacheDir: string): LocalQueueMarker[] {
  const dir = queueMarkersDir(repoRoot, cacheDir);
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        try {
          return JSON.parse(readFileSync(join(dir, f), "utf8")) as LocalQueueMarker;
        } catch {
          return null;
        }
      })
      .filter((m): m is LocalQueueMarker => m !== null && typeof m.taskId === "string");
  } catch {
    return [];
  }
}

export function currentQueueMarkers(
  markers: LocalQueueMarker[],
  liveWaiterPids: Iterable<number>,
): LocalQueueMarker[] {
  const live = new Set(liveWaiterPids);
  return markers
    .filter((marker) => marker.kind !== "local-check" || (marker.pid && live.has(marker.pid)))
    .sort((a, b) => Date.parse(a.since) - Date.parse(b.since))
    .map((marker, index) =>
      marker.kind === "local-check" ? { ...marker, ahead: index, position: index + 1 } : marker,
    );
}
