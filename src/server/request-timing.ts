/**
 * Per-request timing (#0967). Every HTTP request logs its duration (debug,
 * warn at or above 2s). One still open at 10s logs `STUCK <route>` and how
 * long that request has been open.
 *
 * TODO(#0962): when the git worker lands, append its in-flight list (command
 * and age) to the STUCK line. That list is not on main yet, so this log is
 * the route and the request age only.
 *
 * `/api/events` stays open for the life of the tab, so it logs duration when
 * the socket closes and does not emit STUCK.
 */
import type { ServerResponse } from "node:http";

export const SLOW_REQUEST_MS = 2_000;
export const STUCK_REQUEST_MS = 10_000;

export type RequestLog = (level: "debug" | "warn", message: string) => void;

export function requestRoute(method: string, path: string): string {
  return `${method} ${path}`;
}

export function formatRequestDuration(route: string, durationMs: number): string {
  return `${route} ${durationMs}ms`;
}

export function formatStuckRequest(route: string, ageMs: number): string {
  return `STUCK ${route} ${ageMs}ms`;
}

export function watchHttpRequest(opts: {
  method: string;
  path: string;
  res: ServerResponse;
  log: RequestLog;
  /** SSE and other deliberately long-lived routes. */
  skipStuck?: boolean;
  now?: () => number;
  stuckAfterMs?: number;
  slowAfterMs?: number;
}): void {
  const now = opts.now ?? Date.now;
  const startedAt = now();
  const route = requestRoute(opts.method, opts.path);
  const slowAfterMs = opts.slowAfterMs ?? SLOW_REQUEST_MS;
  let finished = false;

  const finish = (): void => {
    if (finished) return;
    finished = true;
    clearTimeout(stuckTimer);
    const durationMs = Math.max(0, now() - startedAt);
    const level = durationMs >= slowAfterMs ? "warn" : "debug";
    opts.log(level, formatRequestDuration(route, durationMs));
  };

  const stuckTimer = opts.skipStuck
    ? undefined
    : setTimeout(() => {
        if (finished) return;
        opts.log("warn", formatStuckRequest(route, Math.max(0, now() - startedAt)));
      }, opts.stuckAfterMs ?? STUCK_REQUEST_MS);
  stuckTimer?.unref?.();

  opts.res.once("finish", finish);
  opts.res.once("close", finish);
}
