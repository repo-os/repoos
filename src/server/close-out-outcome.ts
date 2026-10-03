/**
 * Durable close-out (Move to done) outcomes (#0640).
 *
 * The integration job records only a terminal `phase`; once a job finishes the
 * record is replaced on the next attempt and the pipeline snapshot hides it, so
 * nothing durable survives for the UI to turn into a bell notice. This store
 * appends a small, capped outcome event when a close-out ends and exposes it
 * through the outcomes list endpoint and the `close-out.outcome` SSE event, so
 * a succeeded, failed or timed-out close-out is visible even if the tab was
 * closed while the run happened.
 *
 * Identity is (taskId, finishedAt) — `finishedAt` is the SERVER's terminal
 * time, not when a client first saw it, so the client dedupe id
 * (`<kind>:<taskId>:<finishedAt>`) is stable across reloads and distinct across
 * retries: a retry that later succeeds appends a second, separate event.
 *
 * A user cancel (Stop MTD) deliberately records nothing: it is not an outcome.
 *
 * The server keeps ONE instance per process and shares it with the list route,
 * so the recorded events are mirrored in memory: a disk write that fails is
 * reported through `onPersistError` and the event still serves from memory for
 * the life of the process (the SSE push already delivered it live), rather than
 * silently vanishing from the backfill.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** How a close-out ended. Timeout stays separate so the UI can advise differently. */
export type CloseOutOutcome = "succeeded" | "failed" | "timedOut";

export interface CloseOutOutcomeEvent {
  /** The task whose close-out this was. */
  taskId: string;
  outcome: CloseOutOutcome;
  /** When the close-out FINISHED (server time, ISO-8601 UTC). */
  finishedAt: string;
  /** The failure reason (first line shown by the bell); empty on success. */
  reason: string;
}

export interface CloseOutOutcomeStore {
  /** Append an outcome (deduped by taskId+finishedAt) and return it. */
  record(event: CloseOutOutcomeEvent): CloseOutOutcomeEvent;
  /** All recorded outcomes, newest first. */
  list(): CloseOutOutcomeEvent[];
}

const DEFAULT_CACHE_DIR = ".repoos";
const FILE = "close-out-outcomes.json";
/** Cap on retained events — enough history for notices, never unbounded. */
const MAX_EVENTS = 50;

function isOutcomeEvent(v: unknown): v is CloseOutOutcomeEvent {
  if (!v || typeof v !== "object") return false;
  const e = v as CloseOutOutcomeEvent;
  return (
    typeof e.taskId === "string" &&
    typeof e.finishedAt === "string" &&
    (e.outcome === "succeeded" || e.outcome === "failed" || e.outcome === "timedOut")
  );
}

export function createCloseOutOutcomeStore(
  root: string,
  cacheDir: string = DEFAULT_CACHE_DIR,
  /** Called when a disk write fails, so the loss is reported, never silent. */
  onPersistError?: (error: unknown) => void,
): CloseOutOutcomeStore {
  const path = join(root, cacheDir, FILE);
  /** In-memory mirror; loaded lazily on first use, kept in sync on record. */
  let events: CloseOutOutcomeEvent[] | null = null;
  /** True when the on-disk file existed but could not be read or parsed. */
  let unreadable = false;

  function load(): CloseOutOutcomeEvent[] {
    if (events) return events;
    if (!existsSync(path)) {
      events = [];
      return events;
    }
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
      events = Array.isArray(parsed) ? parsed.filter(isOutcomeEvent) : [];
    } catch (error) {
      // An unreadable/corrupt file must not be treated as authoritative
      // emptiness and then clobbered by the next write: report the read
      // failure and preserve the bytes (renamed aside) before overwriting.
      unreadable = true;
      onPersistError?.(error);
      events = [];
    }
    return events;
  }

  /**
   * Move a corrupt/unreadable outcomes file aside so a later write cannot
   * destroy whatever history it still held. Returns false when the file could
   * not be moved, in which case the caller must NOT overwrite it.
   */
  function preserveUnreadable(): boolean {
    if (!unreadable || !existsSync(path)) return true;
    const backup = `${path}.corrupt-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    try {
      renameSync(path, backup);
      return true;
    } catch (error) {
      onPersistError?.(error);
      return false;
    }
  }

  return {
    record(event) {
      const next = load().filter(
        (e) => !(e.taskId === event.taskId && e.finishedAt === event.finishedAt),
      );
      next.push(event);
      events = next.slice(-MAX_EVENTS);
      // Preserve a corrupt/unreadable file before overwriting it; if it cannot
      // be preserved, skip the write rather than destroying the history.
      if (!preserveUnreadable()) return event;
      unreadable = false;
      try {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, JSON.stringify(events, null, 2));
      } catch (error) {
        // Keep the in-memory copy and report the failure; the close-out itself
        // must never fail because a notice could not be written to disk.
        onPersistError?.(error);
      }
      return event;
    },
    list() {
      return [...load()].sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
    },
  };
}
