/**
 * Stable contract for board events consumed by the CTO monitor, `repoos watch`,
 * and external driver sessions (#0728).
 *
 * Raw SSE payloads are `RepoEvent` (see `live-index.ts`). Watch clients should
 * pass each frame through `projectBoardWatchEvent` to obtain the normalized
 * `taskId`, `cause`, and `evidence` fields documented in
 * `docs/board-events-contract.md`.
 */
import type { CloseOutOutcomeEvent } from "./close-out-outcome.js";
import type { RepoEvent } from "./live-index.js";

/** Deep links and durable paths a consumer can open for more context. */
export interface BoardEventEvidence {
  /** In-app task route, e.g. `/work?task=0728`. */
  task?: string;
  /** Repo-relative log path when the server recorded one on the event. */
  logPath?: string;
  /** API path for close-out outcome history. */
  closeOutOutcomes?: string;
  /** API path for the unified attention feed. */
  attention?: string;
}

/** Normalized event for automation and `repoos watch --json`. */
export interface BoardWatchEvent {
  /** Original RepoOS SSE event type. */
  type: string;
  at: string;
  taskId: string | null;
  cause: string;
  evidence: BoardEventEvidence;
}

export function taskWorkLink(taskId: string): string {
  return `/work?task=${taskId}`;
}

const ATTENTION_API = "/api/attention";
const CLOSE_OUT_API = "/api/close-out/outcomes";

/** Event types `repoos watch` streams by default (see contract doc). */
export const BOARD_WATCH_EVENT_TYPES = new Set<string>([
  "task.updated",
  "task-check.done",
  "review",
  "close-out.outcome",
  "agent.exited",
  "agent.stats",
  "board.alert",
  "attention.updated",
]);

function evidenceForTask(taskId: string, extra?: Partial<BoardEventEvidence>): BoardEventEvidence {
  return {
    task: taskWorkLink(taskId),
    attention: ATTENTION_API,
    closeOutOutcomes: CLOSE_OUT_API,
    ...extra,
  };
}

function statusChangeCause(prev: string | undefined, next: string): string {
  if (prev !== undefined && prev !== next) return `status ${prev} → ${next}`;
  return `status is ${next}`;
}

function closeOutCause(o: CloseOutOutcomeEvent): string {
  if (o.outcome === "succeeded") return "close-out succeeded";
  const line = o.reason.trim().split("\n").find(Boolean);
  if (o.outcome === "timedOut") return line ?? "close-out timed out";
  return line ?? "close-out failed";
}

/**
 * Map a raw SSE `RepoEvent` to the watch contract, or `null` when the event is
 * not part of the CTO/driver feed.
 */
function eventAt(e: RepoEvent): string {
  return "at" in e && typeof e.at === "string" ? e.at : new Date().toISOString();
}

export function projectBoardWatchEvent(e: RepoEvent): BoardWatchEvent | null {
  const at = eventAt(e);
  switch (e.type) {
    case "task.updated": {
      const prevStatus = e.prev?.status;
      const nextStatus = e.task.status;
      if (prevStatus !== undefined && prevStatus === nextStatus) return null;
      return {
        type: e.type,
        at,
        taskId: e.task.id,
        cause: statusChangeCause(prevStatus, nextStatus),
        evidence: evidenceForTask(e.task.id),
      };
    }
    case "task-check.done": {
      const passed = e.passed || e.skipped;
      const outcome = e.skipped ? "skipped" : passed ? "passed" : "failed";
      return {
        type: e.type,
        at,
        taskId: e.taskId,
        cause: `task-check ${outcome} (scope ${e.scope}, id ${e.checkId})`,
        evidence: evidenceForTask(e.taskId),
      };
    }
    case "review": {
      const cause =
        e.state === "ready"
          ? "review finished — report ready"
          : e.state === "failed" || e.state === "incomplete"
            ? e.error?.trim() || `review ${e.state}`
            : `review ${e.state}`;
      return {
        type: e.type,
        at,
        taskId: e.id,
        cause,
        evidence: evidenceForTask(e.id),
      };
    }
    case "close-out.outcome": {
      const o = e.outcome;
      return {
        type: e.type,
        at,
        taskId: o.taskId,
        cause: closeOutCause(o),
        evidence: evidenceForTask(o.taskId),
      };
    }
    case "agent.exited": {
      const cause =
        e.cause?.trim() ||
        (e.exitCode != null && e.exitCode !== 0
          ? `agent exited with code ${e.exitCode}`
          : "agent turn ended");
      return {
        type: e.type,
        at,
        taskId: e.id,
        cause,
        evidence: evidenceForTask(e.id, e.logPath ? { logPath: e.logPath } : undefined),
      };
    }
    case "agent.stats": {
      if (!e.stats.stalled) return null;
      return {
        type: e.type,
        at,
        taskId: e.id,
        cause: "agent run silent while process still alive (possible hang)",
        evidence: evidenceForTask(e.id),
      };
    }
    case "board.alert": {
      return {
        type: e.type,
        at,
        taskId: e.taskId,
        cause: e.cause,
        evidence: { ...e.evidence, attention: ATTENTION_API },
      };
    }
    case "attention.updated": {
      return {
        type: e.type,
        at,
        taskId: null,
        cause: "attention feed changed — refetch for slow-run and hang items",
        evidence: { attention: ATTENTION_API, closeOutOutcomes: CLOSE_OUT_API },
      };
    }
    default:
      return null;
  }
}

export function matchesBoardWatchFilter(
  projected: BoardWatchEvent,
  taskId: string | undefined,
): boolean {
  if (!taskId) return true;
  return projected.taskId === taskId;
}
