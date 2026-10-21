/**
 * `--screenshot` support for `repoos new` / `repoos update` (#0763).
 *
 * An agent that is handed images in chat needs a way to attach them when it
 * creates or updates the task, without hand-copying files into
 * `work/.attachments/<id>/` and guessing at the `## Screenshots` markdown. This
 * module is the one place that turns local image paths into stored attachments:
 * it validates each file against the SAME allowlist and size limit the HTTP
 * upload route uses ({@link saveScreenshot}), stores them through the same
 * storage helper, and extends the task body through the same
 * `patchTaskFile({ addScreenshots })` path the API route uses. No storage logic
 * is duplicated here.
 *
 * The write is local, exactly like the rest of `repoos new` / `repoos update`:
 * it works with no server running, and equally against a running server (which
 * picks the file change up through its work-dir watcher). A caller that wants
 * the server to have the task in the same request can post `attachments` to
 * `POST /api/tasks` instead — both paths land in the same storage.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname } from "node:path";
import type { RepoOSConfig, Task } from "../core/types.js";
import {
  MAX_SCREENSHOT_BYTES,
  mimeForExtension,
  saveScreenshot,
  type ScreenshotMeta,
} from "../server/attachments.js";
import { patchTaskFile } from "../server/write.js";

/** One local image read from disk, ready for `saveScreenshot`. */
export interface ScreenshotInput {
  name: string;
  mime: string;
  /** Base64-encoded file bytes. */
  data: string;
}

/** How many bytes are too many, as human words for the error message. */
function maxMb(): number {
  return Math.round(MAX_SCREENSHOT_BYTES / 1024 / 1024);
}

/**
 * Read and validate one local image file. Validation mirrors the upload route:
 * the extension must map to an allowed MIME type, the file must exist and be a
 * regular file, be non-empty, and be within the size limit. Never throws —
 * problems come back as `{ error }` with the offending path named.
 */
export function readScreenshotFile(filePath: string): ScreenshotInput | { error: string } {
  if (!filePath || filePath.trim() === "") {
    return { error: "empty --screenshot path" };
  }
  if (!existsSync(filePath)) {
    return { error: `image not found: ${filePath}` };
  }
  const stat = statSync(filePath);
  if (!stat.isFile()) {
    return { error: `not a file: ${filePath}` };
  }
  const mime = mimeForExtension(filePath);
  if (!mime) {
    return {
      error: `unsupported image type "${extname(filePath) || filePath}" — supported: .png, .jpg, .jpeg, .gif, .webp, .avif, .bmp`,
    };
  }
  const bytes = readFileSync(filePath);
  if (bytes.length === 0) {
    return { error: `image is empty: ${filePath}` };
  }
  if (bytes.length > MAX_SCREENSHOT_BYTES) {
    return { error: `image is too large (max ${maxMb()} MB): ${filePath}` };
  }
  return { name: filePath, mime, data: bytes.toString("base64") };
}

/** Read every `--screenshot` path, failing fast on the first bad one. */
export function readScreenshotFiles(
  paths: string[],
): { inputs: ScreenshotInput[] } | { error: string } {
  const inputs: ScreenshotInput[] = [];
  for (const path of paths) {
    const result = readScreenshotFile(path);
    if ("error" in result) return { error: result.error };
    inputs.push(result);
  }
  return { inputs };
}

/** Trim a caption into safe markdown alt text, or null when blank. */
function normalizeCaption(caption: string | undefined): string | null {
  const trimmed = (caption ?? "").replace(/[[\]]/g, "").replace(/\s+/g, " ").trim();
  return trimmed || null;
}

/**
 * Store every local image on a task and extend its `## Screenshots` section in
 * one patch (numbering continues from whatever the task already has). The
 * images are gitignored storage under `work/.attachments/<id>/`; only the
 * markdown links land in the task file. Reports the first failure rather than
 * leaving a partial attach silent, and never half-writes the body.
 */
export function attachScreenshots(
  config: RepoOSConfig,
  task: Task,
  paths: string[],
  captions?: string[],
): { metas: ScreenshotMeta[] } | { error: string } {
  const read = readScreenshotFiles(paths);
  if ("error" in read) return { error: read.error };
  const metas: ScreenshotMeta[] = [];
  for (let i = 0; i < read.inputs.length; i++) {
    const input = read.inputs[i];
    const label = normalizeCaption(captions?.[i]);
    const saved = saveScreenshot(config, task, input);
    if ("error" in saved) return { error: saved.error };
    metas.push(label ? { ...saved, name: label } : saved);
  }
  if (metas.length === 0) return { metas };
  patchTaskFile(config, task.absPath, { addScreenshots: metas });
  return { metas };
}
