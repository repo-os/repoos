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
 * body. Appends at the end when there is no Activity section. When the body
 * already has a Screenshots section, the new metas are MERGED with the
 * existing entries (deduped by URL, with the on-disk copy preserved first)
 * so a multi-shot upload or repeated `addScreenshot` patch never drops
 * earlier images (#0382). The section is REBUILT, not appended to, so it
 * still lives in exactly one place even after many `addScreenshot` calls.
 */
export function appendScreenshotsSection(body: string, metas: ScreenshotMeta[]): string {
  // Build the merged, deduped list of image lines: existing entries from the
  // body first, then the new metas in the order they were supplied. Dedup by
  // the rendered markdown line so a re-saved screenshot with the same URL
  // never doubles up.
  const existing = new Set<string>();
  const ordered: string[] = [];
  const re = /!\[([^\]]*)\]\(([^)]+)\)/g;
  for (const match of body.matchAll(re)) {
    const line = match[0];
    if (!existing.has(line)) {
      existing.add(line);
      ordered.push(line);
    }
  }
  for (const m of metas) {
    const line = `![${m.name.replace(/[[\]]/g, "")}](${m.url})`;
    if (!existing.has(line)) {
      existing.add(line);
      ordered.push(line);
    }
  }
  const section = ["## Screenshots", ""].concat(ordered).join("\n");

  // If the body already has a Screenshots section, strip it out first so we
  // can place the rebuilt one in the same spot. Match on the heading line and
  // everything up to (but not including) the next `## ` heading — that's the
  // canonical boundary used by the rest of the body code.
  const SCREENSHOTS_RE = /^## Screenshots\s*\n[\s\S]*?(?=^## |\Z)/m;
  const trimmed = body.replace(/\s+$/, "");
  let withoutScreenshots = trimmed;
  if (SCREENSHOTS_RE.test(withoutScreenshots)) {
    withoutScreenshots = withoutScreenshots.replace(SCREENSHOTS_RE, "").replace(/\n+$/, "");
  }

  const activityIndex = withoutScreenshots.lastIndexOf("\n## Activity\n");
  if (activityIndex === -1) {
    return `${withoutScreenshots}\n\n${section}\n`;
  }
  const before = withoutScreenshots.slice(0, activityIndex).replace(/\s+$/, "");
  const after = withoutScreenshots.slice(activityIndex + 1); // strip leading newline of "\n## Activity"
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
