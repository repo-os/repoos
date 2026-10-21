/** The image types every screenshot upload accepts (#0877). */
export const SCREENSHOT_ACCEPT = "image/png,image/jpeg,image/gif,image/webp,image/avif,image/bmp";

/** A screenshot the shared viewer can render — pending `data:` or stored `/api/` URL. */
export interface ScreenshotShot {
  src: string;
  name: string;
  /**
   * The handoff verdict for a captured shot (#0819), when one was recorded:
   * `matches` renders a green check, `check` a red cross. Pending/attachment
   * shots have no verdict and render no status line.
   */
  verdict?: "matches" | "check";
  /** Plain-words warning for a `check` shot, shown beside the cross (#0819). */
  warning?: string;
}

export function isImageMime(mime: string | undefined | null): boolean {
  return typeof mime === "string" && mime.startsWith("image/");
}

/** Map in-memory pending files to viewer shots. */
export function pendingToShots(items: { name: string; dataUrl: string }[]): ScreenshotShot[] {
  return items.map((s) => ({ src: s.dataUrl, name: s.name }));
}

/** Index of `src` in a shot list, or 0 if it isn't there. */
export function shotIndex(shots: ScreenshotShot[], src: string): number {
  const i = shots.findIndex((s) => s.src === src);
  return i < 0 ? 0 : i;
}
