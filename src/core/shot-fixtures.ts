/**
 * Named preview-board fixtures for declared shot `state` (#0743). The capture
 * path appends `?shotState=<id>` to the route; the UI applies the fixture only
 * on preview builds (`isPreviewBuild`).
 */
export const SHOT_PREVIEW_FIXTURE_IDS = [
  // #0923 — Control dashboard Codebase data so worktree GC captures never
  // race the live resource sampler's loading state.
  "system:worktreeGc",
  "closeOut:active",
  "closeOut:checkProgress",
  "closeOut:checkProgressUnknown",
  "checks:progress",
  // #0778 — like closeOut:active, but the attempt has been idle past the stall
  // threshold, so the task card renders the stalled Cancel/Retry actions.
  "closeOut:stalled",
  // #0782 — an active close-out mid-bundle-upload, so a capture can show the
  // upload-progress card copy instead of the bare stage.
  "closeOut:uploading",
  // #0799 — an active close-out in the remote test run, so a capture can show
  // a non-upload stage heartbeat ("remote tests" + elapsed) on the card.
  "closeOut:remoteTests",
  // #0897 — one host mid close-out with a handoff check queued behind it, so a
  // capture shows job kind, per-phase timings, queue position and the blocker.
  "runners:queued",
  // #0819 — active close-out plus 15 succeeded duration samples so the
  // integration timer tooltip shows "Median … · 15 runs" on a fresh preview.
  "integration:median15",
  "card:doneError",
  "board:withReviewTask",
  // #0778 — review-status task with a non-empty branch, so the task drawer
  // shows UI-changes pane and actions like Add shot and Refresh evidence.
  "drawer:reviewWithBranch",
  // #0867 — review task whose landing pre-checks show one failing merge,
  // so a capture can show the checklist next to Move to done.
  "drawer:landable",
  // #0922 — task drawer with a failed handoff, blocked landing checklist and
  // needs-input card for expanded-tab screenshots.
  "drawer:tabExpandWarnings",
  // #0817 — active task with requirement sections so the drawer shows Update
  // requirements on the spec header (the action is active-only).
  "drawer:activeRequirements",
  // #0819 — a task whose Changes tab carries a captured shot (with its handoff
  // verdict and warning) plus a docs-target skip note, so a capture can show the
  // screenshot viewer header and the "no docs shot declared" warning + link.
  "drawer:shotEvidence",
  // #0829 — task drawer Debug tab with a long log row for expand-to-full-message shots.
  "drawer:debugLogs",
  // #0804 — a ready task flagged by the decision-model human-step check, so a
  // capture can show the flag's explanation on the card.
  "card:humanStep",
  // #0832 — review task with review-rounds-exhausted and a long verdict summary.
  "card:reviewRoundsExhausted",
  // #0810 — a card whose task has a pending worktree-handoff conflict, so a
  // capture can show the "Worktree changed after handoff" modal listing the
  // changed files. Board-only: no drawer, so no fake-id task fetch.
  "card:handoffConflict",
  // #0834 — a review task mid post-handoff checkpoint recovery, so a capture
  // can show the card's "re-reviewing checkpoint…" hint. Board-only: no
  // drawer, so no fake-id task fetch.
  "card:checkpointRecovery",
  // #0776/#0795 — a multi-area, human-assigned card with seeded diff stats, so
  // a capture can show the combined area chip, the human chip and the
  // file-count chip.
  "board:cardChips",
  // #0847 — a ready human task with a branch and zero diff stats, so shots
  // verify the card has no empty file-change chip.
  "card:noChanges",
  // #0787 — active engineer run on the board so captures can show the compact
  // coding indicator on a task card.
  "board:activeCoding",
  // #0822 — ready task with Start work in flight so the card shows Starting….
  "board:startWorkPending",
  // #0822 — same pending state with the task drawer open on the fixture card.
  "drawer:startWorkPending",
  // #0822 — Settings activity-animation preview seeded to bird quick trail.
  "settings:birdQuickTrail",
  // #0833 — Settings activity-animation preview seeded to each multicolor
  // artwork style, so the four new choices can be captured from the real
  // Settings select.
  "settings:rgbKeystorm",
  "settings:wheelieCourier",
  "settings:booSwoop",
  "settings:pumpkinSpell",
  // #0821 — a task with a running agent and a message queued for when the turn
  // ends, so a capture can show the composer's "Queued — will be read when the
  // current turn ends" notice (and a still-usable send control).
  "drawer:queuedMessage",
  // #0775 — a failed dev target on the Dev page, so a capture can show the
  // plain-language failure summary, its port holder and the Stop action.
  "dev:failed",
  // #0801 — a started dev target beside a stopped one, so a capture can show
  // the running highlight (the same cyan glow an active remote runner uses).
  "dev:running",
  // #0805 — clears the configured editor so the fallback "Set editor in
  // Settings → General" hint renders instead of the "Open in editor" button.
  "editor:unconfigured",
  // #0664 — New input panel with a failed attachment upload still retryable
  // after "Create another input".
  "panel:newInputOutstandingUpload",
  // #0664 — New-task freeform panel with a failed screenshot retry row.
  "panel:freeformFailedScreenshot",
  // #0911 — New-task panel with the untouched default screenshot picker.
  "panel:defaultScreenshotPicker",
  // #0850 — Agents page Budget Controls with a paused allowlist row, so a
  // capture can show the Paused chip, reason and resume date.
  "budget:paused",
  // #0841 — Agents scheduled tab with the New schedule drawer open.
  "schedule:newPanel",
  "reminders:due",
] as const;

export type ShotPreviewFixtureId = (typeof SHOT_PREVIEW_FIXTURE_IDS)[number];

export const SHOT_PREVIEW_FIXTURE_QUERY = "shotState";

/** Task id used by card/board fixtures so selectors can target one stable card. */
export const SHOT_PREVIEW_FIXTURE_TASK_ID = "9999";

export function isShotPreviewFixtureId(value: string): value is ShotPreviewFixtureId {
  return (SHOT_PREVIEW_FIXTURE_IDS as readonly string[]).includes(value);
}

/**
 * The page container a fixture needs after it is applied (#0866), so a capture
 * can tell "the fixture never rendered" apart from a clean pass. A drawer shot
 * on the board is a wrong screen even though the fixture query was applied.
 * `null` means the fixture has no structural requirement this capture can
 * check (e.g. a settings seed shown by the route itself).
 */
export type ShotFixtureContainer = "dialog" | "task-card";

export function shotFixtureContainer(fixture: string): ShotFixtureContainer | null {
  if (
    fixture.startsWith("drawer:") ||
    fixture.startsWith("panel:") ||
    fixture.startsWith("schedule:")
  ) {
    return "dialog";
  }
  if (
    fixture.startsWith("board:") ||
    fixture.startsWith("card:") ||
    fixture.startsWith("closeOut:") ||
    fixture.startsWith("integration:")
  ) {
    return "task-card";
  }
  return null;
}

/** `data-*` attribute the app sets when it actually applies a `state` fixture (#0866). */
export const SHOT_PREVIEW_APPLIED_ATTR = "data-repoos-shot-state";

/** Extract fixture ids from the source file's SHOT_PREVIEW_FIXTURE_IDS array (#0786). */
export function extractFixturesFromSource(sourceContent: string): string[] {
  const patterns = [
    /export\s+const\s+SHOT_PREVIEW_FIXTURE_IDS\s*=\s*\[([\s\S]*?)\]\s*as\s+const\b/,
    /export\s+const\s+SHOT_PREVIEW_FIXTURE_IDS\s*=\s*\[([\s\S]*?)\]\s*;/,
    /export\s+const\s+SHOT_PREVIEW_FIXTURE_IDS\s*=\s*\[([\s\S]*?)\]\s*(?:as\s+const)?/,
  ];
  let arrayContent: string | undefined;
  for (const pattern of patterns) {
    const match = sourceContent.match(pattern);
    if (match) {
      arrayContent = match[1];
      break;
    }
  }
  if (!arrayContent) return [];
  const fixtures: string[] = [];
  // Split by lines and extract quoted strings, skipping comment lines
  const lines = arrayContent.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip lines that are comments or empty
    if (!trimmed || trimmed.startsWith("//")) continue;
    // Extract all quoted strings from this line
    const quoteMatches = line.match(/"([^"]+)"/g);
    if (quoteMatches) {
      for (const quoteMatch of quoteMatches) {
        const id = quoteMatch.slice(1, -1); // Remove surrounding quotes
        fixtures.push(id);
      }
    }
  }
  return fixtures;
}

/** Create a validator function for the given fixture ids (#0786). */
export function createFixtureValidator(fixtureIds: readonly string[]): (value: string) => boolean {
  const set = new Set(fixtureIds);
  return (value: string): boolean => set.has(value);
}

/** Read branch fixtures and return a validator, or undefined if unavailable (#0786). */
export function readBranchFixtureValidator(
  readFile: (path: string) => string | null,
  worktreePath: string | null,
): ((id: string) => boolean) | undefined {
  if (!worktreePath) return undefined;
  const content = readFile(`${worktreePath}/src/core/shot-fixtures.ts`);
  if (!content) return undefined;
  const fixtures = extractFixturesFromSource(content);
  return fixtures.length > 0 ? createFixtureValidator(fixtures) : undefined;
}

/**
 * Build the full page URL for one capture entry (origin + route + optional
 * fixture query). Fail-closed on fixture ids (#0786 review round 4): an
 * unknown `state` throws naming the bad fixture and the valid ones, so a
 * typo can never reach the page as a silently-applied no-op query. Declare
 * `fixtureValidator` to admit a task branch's own fixtures (read from the
 * branch's `shot-fixtures.ts`); it defaults to the standard list.
 */
export function shotCapturePageUrl(
  previewOrigin: string,
  entry: { route: string; state?: string },
  fixtureValidator: (id: string) => boolean = isShotPreviewFixtureId,
): string {
  const origin = previewOrigin.replace(/\/$/, "");
  const path = entry.route.startsWith("/") ? entry.route : `/${entry.route}`;
  const url = new URL(`${origin}${path}`);
  if (entry.state) {
    // Validated again at URL build time: parse-time checks rule out most bad
    // ids, but plan snapshots can drift, and a query param for a fixture the
    // page does not know would capture a silently wrong screenshot.
    if (!fixtureValidator(entry.state)) {
      throw new Error(
        `unknown "state" fixture "${entry.state}" — use one of: ` +
          SHOT_PREVIEW_FIXTURE_IDS.join(", "),
      );
    }
    url.searchParams.set(SHOT_PREVIEW_FIXTURE_QUERY, entry.state);
  }
  return url.toString();
}
