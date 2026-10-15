/**
 * Named preview-board fixtures for declared shot `state` (#0743). The capture
 * path appends `?shotState=<id>` to the route; the UI applies the fixture only
 * on preview builds (`isPreviewBuild`).
 */
export const SHOT_PREVIEW_FIXTURE_IDS = [
  "closeOut:active",
  // #0778 — like closeOut:active, but the attempt has been idle past the stall
  // threshold, so the task card renders the stalled Cancel/Retry actions.
  "closeOut:stalled",
  // #0782 — an active close-out mid-bundle-upload, so a capture can show the
  // upload-progress card copy instead of the bare stage.
  "closeOut:uploading",
  "card:doneError",
  "board:withReviewTask",
  // #0778 — review-status task with a non-empty branch, so the task drawer
  // shows UI-changes pane and actions like Add shot and Refresh evidence.
  "drawer:reviewWithBranch",
  // #0776 — a multi-area card with seeded diff stats, so a capture can show
  // the combined area chip and the file-count chip.
  "board:cardChips",
  // #0787 — active engineer run on the board so captures can show the compact
  // coding indicator on a task card.
  "board:activeCoding",
  // #0775 — a failed dev target on the Dev page, so a capture can show the
  // plain-language failure summary, its port holder and the Stop action.
  "dev:failed",
] as const;

export type ShotPreviewFixtureId = (typeof SHOT_PREVIEW_FIXTURE_IDS)[number];

export const SHOT_PREVIEW_FIXTURE_QUERY = "shotState";

/** Task id used by card/board fixtures so selectors can target one stable card. */
export const SHOT_PREVIEW_FIXTURE_TASK_ID = "9999";

export function isShotPreviewFixtureId(value: string): value is ShotPreviewFixtureId {
  return (SHOT_PREVIEW_FIXTURE_IDS as readonly string[]).includes(value);
}

/** Build the full page URL for one capture entry (origin + route + optional fixture query). */
export function shotCapturePageUrl(
  previewOrigin: string,
  entry: { route: string; state?: string },
): string {
  const origin = previewOrigin.replace(/\/$/, "");
  const path = entry.route.startsWith("/") ? entry.route : `/${entry.route}`;
  const url = new URL(`${origin}${path}`);
  if (entry.state) {
    if (!isShotPreviewFixtureId(entry.state)) {
      throw new Error(`unknown shot state fixture "${entry.state}"`);
    }
    url.searchParams.set(SHOT_PREVIEW_FIXTURE_QUERY, entry.state);
  }
  return url.toString();
}
