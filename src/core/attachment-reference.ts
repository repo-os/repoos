/**
 * Stable attachment references in task Markdown (#0661, slice 4).
 *
 * Committed task bodies embed images as ordinary CommonMark links:
 * `![<original name>](/api/tasks/<taskId>/attachments/<objectName>)`.
 * The object name is an opaque storage key (`att_<uuid>.<ext>`) — not a path,
 * not a signed URL, not provider-specific. At serve time the server resolves
 * the reference through the storage provider (`provider.get(taskId, objectName)`).
 *
 * Legacy uploads used sequential `screenshot-N.<ext>` names; those still
 * resolve until migration (#0663) rewrites them.
 */
import { randomUUID } from "node:crypto";
import { extname, join } from "node:path";
import type { RepoOSConfig } from "./types.js";
import { DEFAULT_STORAGE_PROVIDER_ID } from "./storage/index.js";
import { createResilientAttachmentProvider } from "./attachment-resilience.js";

/** Object names for new attachments: `att_<uuid>.<ext>`. */
export const STABLE_ATTACHMENT_OBJECT_RE =
  /^att_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$/i;

/** Pre-#0661 sequential screenshot file names (still resolvable). */
export const LEGACY_SCREENSHOT_OBJECT_RE = /^screenshot-\d+\.[a-z0-9]+$/i;

const TASK_ATTACHMENT_IMAGE_RE = /!\[[^\]]*\]\(\/api\/tasks\/([^/]+)\/attachments\/([^)]+)\)/g;

function isSafeObjectSegment(name: string): boolean {
  return (
    name.length > 0 &&
    name !== "." &&
    name !== ".." &&
    !name.includes("/") &&
    !name.includes("\\") &&
    !name.includes("\0")
  );
}

/** True when `name` is a new opaque attachment token (`att_<uuid>.<ext>`). */
export function isStableAttachmentObjectName(name: string): boolean {
  return STABLE_ATTACHMENT_OBJECT_RE.test(name);
}

/** True when `name` is a legacy sequential screenshot file. */
export function isLegacyScreenshotObjectName(name: string): boolean {
  return LEGACY_SCREENSHOT_OBJECT_RE.test(name);
}

/**
 * True when `name` may be passed to the storage provider for a task attachment.
 * Accepts stable tokens, legacy screenshot names, and any other safe file name
 * already on disk (migration-era content).
 */
export function isResolvableAttachmentObjectName(name: string): boolean {
  return isSafeObjectSegment(name);
}

/**
 * Allocate a new opaque object name for one attachment. `ext` must include the
 * leading dot (e.g. `.png` from {@link SCREENSHOT_MIME}).
 */
export function generateAttachmentObjectName(ext: string): string {
  const suffix = ext.startsWith(".") ? ext : `.${ext}`;
  return `att_${randomUUID()}${suffix}`;
}

/** API path embedded in task Markdown for one stored attachment. */
export function taskAttachmentApiPath(taskId: string, objectName: string): string {
  return `/api/tasks/${taskId}/attachments/${encodeURIComponent(objectName)}`;
}

/** Storage provider for task attachment bytes under the configured work dir. */
export function taskAttachmentStore(config: RepoOSConfig) {
  return createResilientAttachmentProvider(
    join(config.root, config.workDir),
    config.storage?.provider ?? DEFAULT_STORAGE_PROVIDER_ID,
  );
}

/**
 * Resolve a task attachment reference to its stored bytes. `fileParam` is the
 * `:file` route segment (possibly URI-encoded). Returns null on traversal,
 * unknown names, or a miss.
 */
export function resolveTaskAttachmentReference(
  config: RepoOSConfig,
  taskId: string,
  fileParam: string,
): { objectName: string; data: Buffer } | null {
  let objectName: string;
  try {
    objectName = decodeURIComponent(fileParam);
  } catch {
    return null;
  }
  if (!isResolvableAttachmentObjectName(objectName)) return null;
  const data = taskAttachmentStore(config).get(taskId, objectName);
  if (!data) return null;
  return { objectName, data };
}

/** MIME type from a stored attachment file name (image extensions only). */
export function mimeForAttachmentObjectName(file: string): string | null {
  const ext = extname(file).toLowerCase();
  const map: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".bmp": "image/bmp",
  };
  return map[ext] ?? null;
}

/** One embedded task attachment image reference parsed from Markdown. */
export interface ParsedTaskAttachmentReference {
  taskId: string;
  objectName: string;
  alt: string;
}

/**
 * Extract task attachment image references from Markdown (`![alt](url)`).
 * URLs must use the stable `/api/tasks/.../attachments/...` shape.
 */
export function parseTaskAttachmentReferences(markdown: string): ParsedTaskAttachmentReference[] {
  const out: ParsedTaskAttachmentReference[] = [];
  const re = new RegExp(TASK_ATTACHMENT_IMAGE_RE.source, "g");
  for (const match of markdown.matchAll(re)) {
    const taskId = match[1];
    const rawUrl = match[2];
    const full = match[0];
    const altMatch = /^!\[([^\]]*)\]/.exec(full);
    let objectName: string;
    try {
      objectName = decodeURIComponent(rawUrl);
    } catch {
      continue;
    }
    if (!isResolvableAttachmentObjectName(objectName)) continue;
    out.push({ taskId, objectName, alt: altMatch?.[1] ?? "" });
  }
  return out;
}
