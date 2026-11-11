---
task: "1062"
pass: 2
at: "2026-11-10T17:34:49.010Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/same-activity-animation-on-pipeline-card
state: ok
tree_identity: "feb126e00:feb126e00"
---
## Verdict
needs some work — overlays can leave indicators animating; `activity-motion.ts` also conflicts with main.

## Relevance
still relevant — main still lacks Pipeline activity indicators and shared visibility-aware pausing.

## Evidence
None

## Bugs
- **Overlay visibility invalidation** (`src/ui-app/src/lib/activity-motion.ts:40-57`): occlusion is refreshed only on scroll/resize or intersection changes. Opening or closing a drawer/dialog without those events leaves the previous visibility result in place, so covered indicators can keep animating. The test changes the hit-test result and manually retriggers intersection; it does not cover opening an overlay.
- **Merge conflict:** `git merge-tree --write-tree main HEAD` reports a conflict in `src/ui-app/src/lib/activity-motion.ts` (and the task’s bookkeeping markdown). The source conflict blocks landing.

## Edge cases
The required 30-card visible/hidden `getAnimations()` and heap/layer measurements are absent; the engineering report says tests were used “in spirit” instead. The Pipeline shot shows one style, not each configured style.

## Suggestions
The captures show the requested Pipeline and Settings states, but all include a “server is not responding” alert. Recapture the Pipeline shot for each style and capture without the alert.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-10T14:07:49.825Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

