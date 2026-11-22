---
task: "1279"
pass: 4
at: "2026-11-22T13:22:34.824Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/easter-eggs-bundle-rename-review-history
state: ok
tree_identity: "2912ad4ba:5bf382ff25"
---
## Relevance
still relevant — main retains the old header and board-card number chip.

## Evidence
None

## Bugs
- **Class: fit fallback** — `TaskCard.vue:494-500` can leave `feat` after moving clipped badges below, even when `feature` then fits. A 194px row with a long ID, P1, hotfix and merge badges reproduces this.

No further findings of this class were found after grepping: TaskCard, HotfixBadge, card CSS and fixture tests.

## Edge cases
Earlier fit-invalidation and clipping fixes are present. The current-round engineering report is missing; the supplied report predates HEAD.

## Suggestions
Re-capture both shots on HEAD. The available images show the Issues table and plain board numbers, but are stale; the recorded console has no errors. Static browser fixtures do not exercise live fitting.

## Verdict
needs some work — the fit fallback abbreviates feature when the full label fits.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-22T12:59:43.933Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

