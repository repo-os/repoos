/**
 * Durable record of "what happens when the AI release-notes draft is ready"
 * (#1126).
 *
 * The human chooses in the release panel, but the action is owned by the
 * server: the draft is a detached, server-tracked run (#0605), so the pending
 * choice has to outlive the page (a reload, a closed drawer) and the server
 * process itself. This file is the gitignored runtime state for that promise —
 * the same `config.cacheDir` as the release-notes cache, safe to delete.
 *
 * It deliberately stores the exact `version`, `tag` and commit context the
 * human opted into. Auto-publish is outward-facing, so a later request for a
 * different version must never be satisfied by this record, and a draft whose
 * context moved on must fail closed instead of publishing commits the human
 * never saw notes for.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { RepoOSConfig } from "../core/types.js";

/** The two answers offered in the release panel. */
export type ReleaseWhenReady = "publish" | "notify";

export type ReleaseAutoPublishState =
  | "waiting"
  | "ready"
  | "publishing"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "notified";

export interface ReleaseAutoPublishRecord {
  /** Identity of this request; cancellation and settling match on it. */
  requestedAt: string;
  state: ReleaseAutoPublishState;
  mode: ReleaseWhenReady;
  version: string;
  tag: string;
  /** The generated draft, stored only once it exists. */
  notes: string | null;
  /** Known issues typed for the release email at opt-in time. */
  knownIssues: string | null;
  /** Full HEAD when the draft started, for diagnostics and context checks. */
  head: string | null;
  /** Release-notes cache key the draft belongs to; auto-publish requires it to match. */
  draftKey: string | null;
  /** Why a terminal record failed; null otherwise. */
  error: string | null;
  /** UI origin captured at opt-in, so notifications can link absolutely. */
  origin: string | null;
  updatedAt: string;
}

interface StoreShape {
  version: 1;
  autoPublish: ReleaseAutoPublishRecord | null;
}

function storePath(root: string, cacheDir: string): string {
  return join(root, cacheDir, "release-auto-publish.json");
}

/** Tolerates a missing or corrupt file: both mean "nothing pending". */
export function readReleaseAutoPublish(
  config: Pick<RepoOSConfig, "root" | "cacheDir">,
): ReleaseAutoPublishRecord | null {
  try {
    const parsed = JSON.parse(
      readFileSync(storePath(config.root, config.cacheDir), "utf8"),
    ) as Partial<StoreShape> | null;
    if (!parsed || parsed.version !== 1) return null;
    return validRecord(parsed.autoPublish) ? parsed.autoPublish : null;
  } catch {
    return null;
  }
}

function validRecord(value: unknown): value is ReleaseAutoPublishRecord {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.requestedAt === "string" &&
    typeof r.version === "string" &&
    typeof r.tag === "string" &&
    typeof r.updatedAt === "string" &&
    (r.mode === "publish" || r.mode === "notify") &&
    ["waiting", "ready", "publishing", "succeeded", "failed", "cancelled", "notified"].includes(
      String(r.state),
    )
  );
}

/**
 * Persist the record, or clear the file when the record is null (a dismissed
 * terminal outcome). Write failures are swallowed: the worst case is a pending
 * choice that does not survive a restart, never a failed release route.
 */
export function writeReleaseAutoPublish(
  config: Pick<RepoOSConfig, "root" | "cacheDir">,
  record: ReleaseAutoPublishRecord | null,
): void {
  try {
    const path = storePath(config.root, config.cacheDir);
    if (record === null) {
      const payload: StoreShape = { version: 1, autoPublish: null };
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
      return;
    }
    const payload: StoreShape = { version: 1, autoPublish: record };
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  } catch {
    // Non-fatal: the request still runs, it just cannot survive a restart.
  }
}

/** A record that still blocks another request and can still be cancelled. */
export function isReleaseAutoPublishActive(
  record: ReleaseAutoPublishRecord | null,
): record is ReleaseAutoPublishRecord {
  return (
    !!record &&
    (record.state === "waiting" || record.state === "ready" || record.state === "publishing")
  );
}

/** The last record a page should show as an outcome (failed / notified / cancelled / …). */
export function isReleaseAutoPublishTerminal(record: ReleaseAutoPublishRecord | null): boolean {
  return (
    !!record &&
    (record.state === "succeeded" ||
      record.state === "failed" ||
      record.state === "cancelled" ||
      record.state === "notified")
  );
}
