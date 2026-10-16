/**
 * Restart-safe persistence for routing decisions (#0793).
 *
 * A single JSON document under `<root>/<cacheDir>/model-routing/decisions.json`
 * keeps the record legible across server reloads and cold boots. Writes are
 * atomic (temp file + rename) and best-effort: a failure to persist must never
 * change the run's selection, so every fs error is swallowed and surfaces as an
 * empty/failed read rather than a thrown exception. A corrupt file is ignored
 * and overwritten on the next append.
 *
 * Node-only (fs/path); the record shape is in `decisions.ts`.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  MAX_ROUTING_DECISIONS,
  type RoutingDecisionDocument,
  type RoutingDecisionRecord,
} from "./decisions.js";

export interface RoutingDecisionStore {
  /** Newest-first records, bounded. Never throws. */
  list(limit?: number): RoutingDecisionRecord[];
  /** All records this task, newest-first. */
  listForTask(taskId: string, limit?: number): RoutingDecisionRecord[];
  /** Append one record, trimming to the cap. Never throws. */
  append(record: RoutingDecisionRecord): void;
  /** Remove every record (used by tests and a config reset). */
  clear(): void;
}

export function routingDecisionsPath(root: string, cacheDir: string): string {
  return join(root, cacheDir || ".repoos", "model-routing", "decisions.json");
}

export function createRoutingDecisionStore(root: string, cacheDir: string): RoutingDecisionStore {
  const file = routingDecisionsPath(root, cacheDir);

  function read(): RoutingDecisionRecord[] {
    try {
      const raw = readFileSync(file, "utf8");
      const doc = JSON.parse(raw) as RoutingDecisionDocument;
      if (!doc || !Array.isArray(doc.records)) return [];
      return doc.records.filter((r): r is RoutingDecisionRecord => !!r && typeof r.id === "string");
    } catch {
      return [];
    }
  }

  function write(records: RoutingDecisionRecord[]): void {
    try {
      mkdirSync(dirname(file), { recursive: true });
      const doc: RoutingDecisionDocument = { version: 1, records };
      const tmp = `${file}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(doc), "utf8");
      renameSync(tmp, file);
    } catch {
      // Persistence is best-effort; the run's selection is already decided.
    }
  }

  return {
    list(limit?: number): RoutingDecisionRecord[] {
      const records = read();
      return typeof limit === "number" ? records.slice(0, Math.max(0, limit)) : records;
    },
    listForTask(taskId: string, limit?: number): RoutingDecisionRecord[] {
      const records = read().filter((r) => r.taskId === taskId);
      return typeof limit === "number" ? records.slice(0, Math.max(0, limit)) : records;
    },
    append(record: RoutingDecisionRecord): void {
      const records = [record, ...read()].slice(0, MAX_ROUTING_DECISIONS);
      write(records);
    },
    clear(): void {
      write([]);
    },
  };
}
