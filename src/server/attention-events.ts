/**
 * Durable attention events (#0687) — provider failures and remote-validation
 * fallbacks that are not already captured in close-out outcomes.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { RecordedAttentionEvent } from "../core/attention.js";

export interface AttentionEventStore {
  record(event: Omit<RecordedAttentionEvent, "id"> & { id?: string }): RecordedAttentionEvent;
  list(): RecordedAttentionEvent[];
}

const FILE = "attention-events.json";
const MAX_EVENTS = 80;

function isRecordedEvent(v: unknown): v is RecordedAttentionEvent {
  if (!v || typeof v !== "object") return false;
  const e = v as RecordedAttentionEvent;
  return (
    typeof e.id === "string" &&
    (e.kind === "providerFailure" || e.kind === "remoteFallback" || e.kind === "ctoAction") &&
    typeof e.message === "string" &&
    typeof e.detail === "string" &&
    typeof e.at === "string"
  );
}

export function createAttentionEventStore(
  root: string,
  cacheDir: string = ".repoos",
  onPersistError?: (error: unknown) => void,
): AttentionEventStore {
  const path = join(root, cacheDir, FILE);
  let events: RecordedAttentionEvent[] | null = null;
  let unreadable = false;

  function load(): RecordedAttentionEvent[] {
    if (events) return events;
    if (!existsSync(path)) {
      events = [];
      return events;
    }
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
      events = Array.isArray(parsed) ? parsed.filter(isRecordedEvent) : [];
    } catch (error) {
      unreadable = true;
      onPersistError?.(error);
      events = [];
    }
    return events;
  }

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

  function persist(next: RecordedAttentionEvent[]): void {
    if (!preserveUnreadable()) return;
    try {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify(next, null, 2), "utf8");
      unreadable = false;
    } catch (error) {
      onPersistError?.(error);
    }
  }

  return {
    record(event) {
      const id =
        event.id ??
        `${event.kind}:${event.taskId ?? "board"}:${event.at}:${event.message.slice(0, 40)}`;
      const full: RecordedAttentionEvent = {
        id,
        kind: event.kind,
        taskId: event.taskId ?? null,
        message: event.message,
        detail: event.detail,
        at: event.at,
      };
      const next = load().filter((e) => e.id !== full.id);
      next.push(full);
      events = next.slice(-MAX_EVENTS);
      persist(events);
      return full;
    },
    list() {
      return [...load()].sort((a, b) => b.at.localeCompare(a.at));
    },
  };
}
