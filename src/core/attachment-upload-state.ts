/**
 * Persisted upload progress for attachment bytes (#0664, slice 7).
 *
 * Migration (#0663) and future UI upload/retry flows share this store so an
 * interrupted transfer can resume without creating duplicate cloud objects: each
 * record tracks the intended object name, content hash, and phase.
 *
 * #0664 should extend this module (same file path and record shape) rather than
 * introduce a parallel store — UI retries key off `uploadRecordKey` + `phase`.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { RepoOSConfig } from "./types.js";

export type AttachmentUploadPhase = "pending" | "uploading" | "uploaded" | "verified" | "failed";

/** Logical attachment base: task screenshots vs input attachments. */
export type AttachmentUploadBase = "work" | "inputs";

/** One in-flight or completed upload, keyed by {@link uploadRecordKey}. */
export interface AttachmentUploadRecord {
  base: AttachmentUploadBase;
  /** Storage namespace (task id or input id). */
  namespace: string;
  /** File name on the local provider before migration completes. */
  sourceName: string;
  /** Object name in the target provider (may differ when rewriting legacy names). */
  targetName: string;
  phase: AttachmentUploadPhase;
  /** SHA-256 hex of the bytes that must appear in the target store. */
  contentSha256: string;
  byteLength: number;
  /** Last error when `phase` is `failed`. */
  error?: string;
  updatedAt: string;
}

export interface AttachmentUploadStateFile {
  version: 1;
  records: Record<string, AttachmentUploadRecord>;
}

const STATE_VERSION = 1;
const STATE_BASENAME = "attachment-upload-state.json";

export function uploadStatePath(config: Pick<RepoOSConfig, "root" | "cacheDir">): string {
  return join(config.root, config.cacheDir, STATE_BASENAME);
}

export function uploadRecordKey(
  base: AttachmentUploadBase,
  namespace: string,
  sourceName: string,
): string {
  return `${base}:${namespace}:${sourceName}`;
}

export function readAttachmentUploadState(
  config: Pick<RepoOSConfig, "root" | "cacheDir">,
): AttachmentUploadStateFile {
  try {
    const raw = readFileSync(uploadStatePath(config), "utf8");
    const parsed = JSON.parse(raw) as AttachmentUploadStateFile;
    if (parsed?.version === STATE_VERSION && parsed.records && typeof parsed.records === "object") {
      return parsed;
    }
  } catch {
    /* missing or corrupt — start fresh */
  }
  return { version: STATE_VERSION, records: {} };
}

export function writeAttachmentUploadState(
  config: Pick<RepoOSConfig, "root" | "cacheDir">,
  state: AttachmentUploadStateFile,
): void {
  const path = uploadStatePath(config);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2), "utf8");
}

export function upsertUploadRecord(
  config: Pick<RepoOSConfig, "root" | "cacheDir">,
  record: AttachmentUploadRecord,
): AttachmentUploadRecord {
  const state = readAttachmentUploadState(config);
  const key = uploadRecordKey(record.base, record.namespace, record.sourceName);
  const next = { ...record, updatedAt: new Date().toISOString() };
  state.records[key] = next;
  writeAttachmentUploadState(config, state);
  return next;
}
