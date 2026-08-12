/**
 * Task screenshot attachments (0123).
 *
 * Screenshots are uploaded from the New task panel and land in
 * `<workDir>/.attachments/<taskId>/`, referenced from the task body's
 * `## Screenshots` section (kept BEFORE the append-only Activity section).
 * Files are served back through `GET /api/tasks/:id/attachments/:file`.
 * Dependency-free, mirroring the rest of the server: base64 in JSON in, a
 * small safe writer for storage.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve, sep } from "node:path";
import type { RepoOSConfig, Task } from "../core/types.js";

/** One persisted screenshot, as returned to the client. */
export interface ScreenshotMeta {
  /** 1-based index within the task's attachment folder. */
  id: string;
  /** Original file name (sanitized). */
  name: string;
  /** Repo-relative path, e.g. "work/.attachments/0123/screenshot-1.png". */
  path: string;
  /** API URL the UI can load the image from. */
  url: string;
  size: number;
  mime: string;
}

/** Image MIME types treated as screenshots, mapped to their file extension. */
export const SCREENSHOT_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/avif": ".avif",
  "image/bmp": ".bmp",
};

/** Max decoded size for one screenshot upload (bytes). */
export const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;

export function attachmentsDir(root: string, workDir: string, taskId: string): string {
  return join(root, workDir, ".attachments", taskId);
}

/** API URL that serves one stored screenshot. */
export function screenshotUrl(taskId: string, file: string): string {
  return `/api/tasks/${taskId}/attachments/${encodeURIComponent(file)}`;
}

/** Strip directories and hostile characters from an uploaded file name. */
export function sanitizeName(name: string): string {
  const base = basename(name)
    .replace(/\.[^./]+$/, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "screenshot";
}

/**
 * Persist one uploaded screenshot under the task's attachment folder and
 * return its metadata, or `{ error }` on invalid input. Never throws.
 */
export function saveScreenshot(
  config: RepoOSConfig,
  task: Task,
  input: { name?: unknown; mime?: unknown; data?: unknown },
): ScreenshotMeta | { error: string } {
  if (
    typeof input?.name !== "string" ||
    typeof input?.mime !== "string" ||
    typeof input?.data !== "string"
  ) {
    return { error: "name, mime, and base64 data are required" };
  }
  const ext = SCREENSHOT_MIME[input.mime];
  if (!ext) {
    const supported = Object.keys(SCREENSHOT_MIME).join(", ");
    return { error: `Unsupported image type "${input.mime}" — supported: ${supported}` };
  }
  let buf: Buffer;
  try {
    buf = Buffer.from(input.data, "base64");
  } catch {
    return { error: "Invalid base64 image data" };
  }
  if (buf.length === 0) return { error: "Image data is empty" };
  if (buf.length > MAX_SCREENSHOT_BYTES) {
    return {
      error: `Image is too large (max ${Math.round(MAX_SCREENSHOT_BYTES / 1024 / 1024)} MB)`,
    };
  }

  const dir = attachmentsDir(config.root, config.workDir, task.id);
  mkdirSync(dir, { recursive: true });
  const taken = new Set(existsSync(dir) ? readdirSync(dir) : []);
  let next = 1;
  while (taken.has(`screenshot-${next}${ext}`)) next++;
  const file = `screenshot-${next}${ext}`;
  writeFileSync(join(dir, file), buf);

  return {
    id: String(next),
    name: sanitizeName(input.name),
    path: `${config.workDir.split("\\").join("/")}/.attachments/${task.id}/${file}`,
    url: screenshotUrl(task.id, file),
    size: buf.length,
    mime: input.mime,
  };
}

/**
 * Insert a `## Screenshots` section into a task body, keeping it BEFORE the
 * append-only Activity section so the activity log stays the last thing in the
 * body. Appends at the end when there is no Activity section.
 */
export function appendScreenshotsSection(body: string, metas: ScreenshotMeta[]): string {
  const section = ["## Screenshots", ""]
    .concat(metas.map((m) => `![${m.name.replace(/[[\]]/g, "")}](${m.url})`))
    .join("\n");
  const trimmed = body.replace(/\s+$/, "");
  const activityIndex = trimmed.lastIndexOf("\n## Activity\n");
  if (activityIndex === -1) {
    return `${trimmed}\n\n${section}\n`;
  }
  const before = trimmed.slice(0, activityIndex).replace(/\s+$/, "");
  const after = trimmed.slice(activityIndex + 1); // strip the leading newline of "\n## Activity"
  return `${before}\n\n${section}\n\n${after}\n`;
}

/**
 * Resolve a stored screenshot to its absolute path, refusing path traversal
 * outside the task's own attachment folder. Returns null on a miss.
 */
export function resolveScreenshot(
  config: RepoOSConfig,
  taskId: string,
  file: string,
): string | null {
  const base = resolve(attachmentsDir(config.root, config.workDir, taskId));
  const abs = resolve(base, decodeURIComponent(file));
  if (!abs.startsWith(base + sep)) return null;
  if (!existsSync(abs) || !statSync(abs).isFile()) return null;
  return abs;
}

/** Reverse of {@link SCREENSHOT_MIME}: file extension -> MIME type. */
const EXTENSION_MIME: Record<string, string> = Object.fromEntries(
  Object.entries(SCREENSHOT_MIME).map(([mime, ext]) => [ext, mime]),
);

/** MIME type for a stored screenshot file by extension, or null when unknown. */
export function mimeForExtension(file: string): string | null {
  return EXTENSION_MIME[extname(file).toLowerCase()] ?? null;
}
