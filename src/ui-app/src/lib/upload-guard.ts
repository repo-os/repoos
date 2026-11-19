/**
 * Client-side checks for screenshot picks, run before a file is read or sent.
 *
 * Each rejection is a plain-English sentence that names the file and says what
 * to do next, so the panel can show it as-is. The size limit mirrors the
 * server's `MAX_SCREENSHOT_BYTES` (src/server/attachments.ts); a test keeps the
 * two equal.
 */

/** Mirrors the server's per-screenshot cap (10 MB). */
export const SCREENSHOT_MAX_BYTES = 10 * 1024 * 1024;

const SCREENSHOT_MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
};

const SUPPORTED_LIST = "PNG, JPEG, GIF, WebP, AVIF or BMP";

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
}

/**
 * The image MIME type for a pick, or null when it is not a supported image.
 * Browsers leave `type` empty for some formats (AVIF on older systems), so the
 * extension is the fallback.
 */
export function screenshotMime(file: Pick<File, "name" | "type">): string | null {
  const byType = file.type.toLowerCase();
  if (Object.values(SCREENSHOT_MIME_BY_EXT).includes(byType)) return byType;
  if (byType) return null;
  return SCREENSHOT_MIME_BY_EXT[extensionOf(file.name)] ?? null;
}

/** Rounds up to one decimal, so a file just over the cap never reads as "10.0 MB" against a "10 MB" limit. */
function megabytes(bytes: number): string {
  return (Math.ceil((bytes / (1024 * 1024)) * 10) / 10).toString();
}

/**
 * Why a pick must not be added, or null when it can be. Checks run in the
 * order a person would fix them: empty, wrong type, then too large.
 */
export function screenshotRejection(file: Pick<File, "name" | "type" | "size">): string | null {
  if (file.size === 0) {
    return `“${file.name}” is empty. Pick a file that has content.`;
  }
  if (!screenshotMime(file)) {
    return `“${file.name}” isn’t an image we can attach. Use ${SUPPORTED_LIST} files.`;
  }
  if (file.size > SCREENSHOT_MAX_BYTES) {
    return `“${file.name}” is ${megabytes(file.size)} MB, and the limit is ${SCREENSHOT_MAX_BYTES / (1024 * 1024)} MB. Crop or compress it, then add it again.`;
  }
  return null;
}

/**
 * A name not already in `taken`: `shot.png` becomes `shot-2.png`, then
 * `shot-3.png`. The server stores a repeated name over the earlier file, so
 * two picks must never share one.
 */
export function uniqueAttachmentName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let n = 2; ; n++) {
    const candidate = `${stem}-${n}${ext}`;
    if (!taken.has(candidate)) return candidate;
  }
}
