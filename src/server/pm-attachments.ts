/**
 * Chat-input screenshots carried onto the task the PM creates from them (0381).
 *
 * When a PM chat message arrives with images, the task it will spawn does not
 * exist yet — the PM authors it later, mid-run, through `repoos new`. So the
 * message route cannot attach the images the way the New-task panel does
 * (there the task id is known at upload time). Instead the images are parked
 * on disk as a pending batch keyed to the PM session, and the moment a task
 * is created while that session is running, the batch is moved into the new
 * task's attachment folder and referenced from its `## Screenshots` section —
 * the exact storage/serving convention every other screenshot uses
 * (`work/.attachments/<taskId>/`, gitignored, served from disk).
 *
 * Matching rule: the oldest pending batch whose PM session is still running
 * wins. Runs are short and a user attaches images seconds before the PM
 * starts working, so "created while that session is running" almost always
 * means "created from this message"; a human creating a task inside that
 * same window is the rare false positive, bounded by a 10-minute TTL.
 * Unclaimed batches (the PM never creates a task) expire and are deleted —
 * the pending folder never accumulates.
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RepoOSConfig, Task } from "../core/types.js";
import {
  MAX_SCREENSHOT_BYTES,
  SCREENSHOT_MIME,
  attachmentsDir,
  sanitizeName,
  screenshotUrl,
  type ScreenshotMeta,
} from "./attachments.js";
import { patchTaskFile } from "./write.js";

/** One image parked on disk awaiting the task it will land on. */
interface PendingImage {
  /** Absolute path of the saved file inside the batch's pending dir. */
  absPath: string;
  /** Original (already sanitized) file name, for the Screenshots alt text. */
  name: string;
  mime: string;
  /** Decoded size in bytes (the attachment folder's names are reused per task). */
  size: number;
}

interface PendingBatch {
  id: string;
  sessionKey: string;
  dir: string;
  images: PendingImage[];
  at: number;
}

const batches = new Map<string, PendingBatch>();

/** A batch unclaimed this long is deleted — the PM run that would claim it is long over. */
const PENDING_TTL_MS = 10 * 60 * 1000;

/** Upper bound on queued batches per PM session (each send with images = one batch). */
const MAX_BATCHES_PER_SESSION = 8;

/** Pending storage lives beside the task attachment folders, under the gitignored work dir. */
function pendingRoot(config: RepoOSConfig): string {
  return join(config.root, config.workDir, ".attachments", "_pm-pending");
}

/** Delete every batch past its TTL, and its files. Runs on every entry point. */
function prune(): void {
  const now = Date.now();
  for (const [id, batch] of batches) {
    if (now - batch.at <= PENDING_TTL_MS) continue;
    batches.delete(id);
    rmSync(batch.dir, { recursive: true, force: true });
  }
}

export interface QueuedPmImages {
  batchId: string | null;
  /** How many images actually landed in the pending batch. */
  queued: number;
  /** Per-image rejection reasons (bad type, empty, too large). */
  errors: string[];
}

/** The shape the client posts per image (same as the attachment-upload endpoint). */
export interface IncomingPmImage {
  name?: unknown;
  mime?: unknown;
  data?: unknown;
}

/**
 * Validate and park images from one PM chat message as a pending batch keyed
 * to that session. Never throws — per-image problems come back as `errors`
 * while the rest of the batch still queues.
 */
export function queuePmImages(
  config: RepoOSConfig,
  sessionKey: string,
  images: IncomingPmImage[],
): QueuedPmImages {
  prune();
  const errors: string[] = [];
  if (!Array.isArray(images) || images.length === 0) {
    return { batchId: null, queued: 0, errors };
  }
  const dir = join(pendingRoot(config), `${Date.now()}-${randomUUID().slice(0, 8)}`);
  const saved: PendingImage[] = [];
  images.forEach((img, i) => {
    const mime = typeof img?.mime === "string" ? img.mime : "";
    const ext = SCREENSHOT_MIME[mime];
    if (!ext) {
      errors.push(
        `image ${i + 1}: unsupported type "${mime || "unknown"}" — supported: ${Object.keys(
          SCREENSHOT_MIME,
        ).join(", ")}`,
      );
      return;
    }
    const data = typeof img?.data === "string" ? img.data : "";
    let buf: Buffer;
    try {
      buf = Buffer.from(data, "base64");
    } catch {
      errors.push(`image ${i + 1}: invalid base64 data`);
      return;
    }
    if (buf.length === 0) {
      errors.push(`image ${i + 1}: image data is empty`);
      return;
    }
    if (buf.length > MAX_SCREENSHOT_BYTES) {
      errors.push(
        `image ${i + 1}: too large (max ${Math.round(MAX_SCREENSHOT_BYTES / 1024 / 1024)} MB)`,
      );
      return;
    }
    try {
      mkdirSync(dir, { recursive: true });
      const file = `${String(saved.length + 1).padStart(3, "0")}${ext}`;
      const absPath = join(dir, file);
      writeFileSync(absPath, buf);
      saved.push({
        absPath,
        name: sanitizeName(typeof img?.name === "string" ? img.name : ""),
        mime,
        size: buf.length,
      });
    } catch (err) {
      errors.push(`image ${i + 1}: could not store — ${err instanceof Error ? err.message : err}`);
    }
  });
  if (saved.length === 0) {
    rmSync(dir, { recursive: true, force: true });
    return { batchId: null, queued: 0, errors };
  }
  const id = randomUUID();
  batches.set(id, { id, sessionKey, dir, images: saved, at: Date.now() });
  // Cap per session: drop the session's oldest batches beyond the limit.
  const forSession = [...batches.values()]
    .filter((b) => b.sessionKey === sessionKey)
    .sort((a, b) => a.at - b.at);
  for (const old of forSession.slice(0, Math.max(0, forSession.length - MAX_BATCHES_PER_SESSION))) {
    batches.delete(old.id);
    rmSync(old.dir, { recursive: true, force: true });
  }
  return { batchId: id, queued: saved.length, errors };
}

/** Remove a just-queued batch (e.g. the PM send was rejected) and its files. */
export function dropPmImages(batchId: string | null): void {
  if (!batchId) return;
  const batch = batches.get(batchId);
  if (!batch) return;
  batches.delete(batchId);
  rmSync(batch.dir, { recursive: true, force: true });
}

/**
 * Attach the oldest pending batch whose PM session is still running to a
 * freshly created task: move the files into the task's attachment folder
 * under the usual `screenshot-N` names, reference them from the task body's
 * `## Screenshots` section, and return the re-parsed task for the caller to
 * apply to the index. Returns null when nothing is pending for a running
 * session — the common case — or on any failure (best-effort; a failed
 * attach never blocks the task creation itself, and the batch is dropped so
 * a half-attached set cannot re-attach to a later task).
 */
export function attachPendingPmImages(
  config: RepoOSConfig,
  task: Task,
  isSessionRunning: (sessionKey: string) => boolean,
): Task | null {
  prune();
  const batch = [...batches.values()]
    .filter((b) => isSessionRunning(b.sessionKey))
    .sort((a, b) => a.at - b.at)[0];
  if (!batch) return null;
  batches.delete(batch.id);
  try {
    const dir = attachmentsDir(config.root, config.workDir, task.id);
    mkdirSync(dir, { recursive: true });
    const taken = new Set(existsSync(dir) ? readdirSync(dir) : []);
    const metas: ScreenshotMeta[] = [];
    for (const img of batch.images) {
      const ext = img.absPath.slice(img.absPath.lastIndexOf("."));
      let next = 1;
      while (taken.has(`screenshot-${next}${ext}`)) next++;
      const file = `screenshot-${next}${ext}`;
      renameSync(img.absPath, join(dir, file));
      taken.add(file);
      metas.push({
        id: String(next),
        name: img.name,
        path: `${config.workDir.split("\\").join("/")}/.attachments/${task.id}/${file}`,
        url: screenshotUrl(task.id, file),
        size: img.size,
        mime: img.mime,
      });
    }
    rmSync(batch.dir, { recursive: true, force: true });
    if (metas.length === 0) return null;
    return patchTaskFile(config, task.absPath, { addScreenshots: metas });
  } catch {
    rmSync(batch.dir, { recursive: true, force: true });
    return null;
  }
}

/** Test hook: drop all in-memory batches (files under tmp roots are removed by the tests). */
export function resetPmImages(): void {
  for (const batch of batches.values()) {
    rmSync(batch.dir, { recursive: true, force: true });
  }
  batches.clear();
}
