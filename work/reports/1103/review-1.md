---
task: "1103"
pass: 1
at: "2026-11-14T04:42:04.452Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/keep-review-verdict-after-a-take-main-s-
state: ok
tree_identity: "2cf4f7e70:4af866d07"
---
## Verdict

`needs some work` — UI never calls keep-check after conflicts are cleared, so the new action is unreachable in the post-merge review-lock case the task targets.

## Relevance

`still relevant` — Landable still hard-fails when the reviewed SHA lags after a take-main merge; this flow directly addresses #1081.

## Evidence

None

## Bugs

- **Class: client-side keep-check gating** — `DoneErrorCard.vue` and `DebugPanel.vue` only call `GET …/review/keep-check` when `doneError.conflicts` is non-empty (`checkKeepReview` early-return / `loadConflict` guard). After the user merges main and retries close-out, the failure card often shows review-lock or check errors with `conflicts: []` (see `done-error.test.ts`), so polling never runs and the button stays hidden exactly when keep is needed. The server check is ungated; only the UI predicate is wrong.
- **Class: client-side keep-check gating** — `DebugPanel.vue` “Merge conflict” view shows “No merge conflict” after resolution but still skips `checkKeepReview` unless stale `doneError.conflicts` exists, so Debug-tab parity with the spec (“after the conflict is resolved”) fails on the normal path.

No further findings of this class were found after grepping: `DoneErrorCard.vue`, `DebugPanel.vue`, `TaskCard.vue`, `TaskDrawer.vue`, `repo.ts`, `tasks.ts` (keep/keep-check handlers), `take-main-review.ts`, CLI parity.

## Edge cases

Server classifier conservatively requires a clean worktree, two-parent merge, reviewed ancestor of the first parent, and per-path blob equality with the merge’s second parent; octopus merges and non-merge tips are refused (intended). `repoos review keep` re-pins only; UI then calls `completeTask` — acceptable CLI/UI split.

## Suggestions

Extend the `card:doneError` shot fixture with conflicts plus a mocked safe keep-check if you want handoff evidence of the new button (current capture cannot show it: empty `conflicts`). Consider wiring `DoneErrorCard` busy state like `DebugPanel` to avoid double-submit from the card emit path.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-14T04:39:55.407Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

