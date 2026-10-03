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
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
): CloseOutOutcomeStore {
  const path = join(root, cacheDir, FILE);

  function read(): CloseOutOutcomeEvent[] {
    if (!existsSync(path)) return [];
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
      return Array.isArray(parsed) ? parsed.filter(isOutcomeEvent) : [];
    } catch {
      /* corrupt or unreadable: behave as "no outcomes" rather than throwing */
      return [];
    }
  }

  return {
    record(event) {
      const events = read().filter(
        (e) => !(e.taskId === event.taskId && e.finishedAt === event.finishedAt),
      );
      events.push(event);
      try {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, JSON.stringify(events.slice(-MAX_EVENTS), null, 2));
      } catch {
        /* best-effort: failing to persist must never fail the close-out */
      }
      return event;
    },
    list() {
      return read().sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
    },
  };
}
