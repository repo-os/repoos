---
task: "1111"
pass: 1
at: "2026-11-14T09:15:45.927Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/docs-and-landing-sync-after-v0-5-84-user
state: ok
tree_identity: "48034d8c4:"
---
## Verdict

`needs some work` — New `repoos review keep` user-docs claim close-out continues from the CLI; the CLI only re-pins the lock.

## Relevance

`still relevant` — Public guides for v0.5.84-era features were missing or thin; this branch adds the scoped fixes the task describes.

## Evidence

None

## Bugs

- **Class: docs/CLI parity mismatch** — `user-docs/cli.md` says keep “continues through the normal close-out pipeline”; `src/commands/control-api.ts` only `POST`s `/api/tasks/:id/review/keep` and exits (no `/done`).
- **Class: docs/CLI parity mismatch** — `user-docs/review-and-close-out.md` says the CLI is the “same operation” as **Keep review verdict and merge**; the UI path calls `completeTask` after keep (`src/ui-app/src/stores/repo.ts` `keepReviewAndMerge`), which the CLI does not.

No further findings of this class were found after grepping: `user-docs/cli.md`, `user-docs/review-and-close-out.md`, `src/commands/control-api.ts`, `src/ui-app/src/stores/repo.ts`, diff hunks.

## Edge cases

#1108 (idle auto-recover) and #1109 (`repoos restart` for hand-started servers) remain undocumented here; engineer report matches board state. Close-out should heal the task-file merge conflict only. `shots: skipped` is correct for this docs-only diff.

## Suggestions

Note the Debug tab hosts the same keep action (`DebugPanel.vue`). Mention `repoos done <id>` (or UI **Move to done**) after a successful CLI keep. Regenerated `llms*.txt` are build artifacts; confirm on publish build if desired.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

