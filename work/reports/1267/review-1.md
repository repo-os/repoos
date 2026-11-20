---
task: "1267"
pass: 1
at: "2026-11-20T04:57:09.505Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/shots-capture-ui-changes-at-phone-and-de
state: ok
tree_identity: "46b85b5c1:"
---
## Verdict
`good to go` — viewport presets, per-shot capture, phone/desktop auto fan-out and size captions are all correct and tested.

## Relevance
`still relevant` — mobile QA passes still get desktop-only automatic captures on main; this lands exactly the missing per-shot viewport field and fan-out.

## Evidence
None

## Bugs
None found

`No further findings of this class were found after grepping: captureEntryPage and its viewport fallbacks (shot-capture.ts:107, shot.ts:870), provenanceCaption call sites (shot-capture.ts:586/923/1327, ui-handoff-gate.ts:1023, shot.ts:930/980), buildCapturePlan callers (server shot-capture.ts:389, cli buildCliShotPlan), collapseKey/fingerprint/reuse scoring (shot-plan.ts:1099/1260/1419/1547), parseShot width/height bounds and preset cross-check, update --shots validation path (src/commands/tasks.ts shotsError/shotsSectionContent), declared-shot delete-sync manifest, hard-coded 1280x800 fallbacks across src, and setDefaultTimeout/Vite-server sibling tests (only the two fixed files use setDefaultTimeout).`

## Edge cases
- Caption vs. actual size stay consistent on every path: server handoff uses `DEFAULT_SHOT_VIEWPORT` (desktop) and passes no `defaultViewport`; CLI local capture uses `opts.viewport`, which equals the plan's `defaultViewport`; an explicit `--viewport` forces local capture via `remoteWebCaptureBlocker`, so the server never sees a non-default default. No drift found.
- `viewport` mixed with partial `viewportWidth`/`viewportHeight` is rejected on mismatch (test covers width; the same comparison covers height); partial matches that agree are accepted.
- Command targets: size fields and the size caption are stripped — one entry, no fan-out (tested).
- The auto fan-out only runs when no declared shots exist at all, so it cannot collide with declared entries in the collapse key; the two sizes of one target have distinct keys.
- Preview lifecycle under fan-out: the loop starts the preview once per target and reuses it for both sizes; `maxAutoShots` correctly left untouched (it caps command output files, not web entries).
- The Vite `optimizeDeps.entries` fixture paths match the files on disk; only the two failing files were changed and they are the only tests using `setDefaultTimeout`.

## Suggestions
- `src/commands/shot.ts:80` keeps a local `VIEWPORT = {1280, 800}` duplicating `DEFAULT_SHOT_VIEWPORT`; importing the core constant would prevent drift.
- Once a preview is requested, glance at one real phone capture to confirm the frame visually — the engineer noted this session never drove a browser through `captureEntryPage`; nothing here blocks on that.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

