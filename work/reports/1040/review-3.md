---
task: 1040
pass: 3
at: "2026-11-06T15:27:34.672Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/easter-eggs-bundle-card-details-link-and
state: ok
tree_identity: "244465d2c:36f39f662"
---
## Verdict
needs some work — keyboard users cannot reliably reach the teleported rows, and the agent trigger retains a native tooltip.

## Relevance
still relevant — the base branch still has the redundant Details link and non-clickable preview rows.

## Evidence
None

## Bugs
- **Teleported-popover keyboard focus order** — `TaskCard.vue:1536-1538, 1564-1577, 1589-1598`: focusing the trigger opens the preview, but Tab follows the app’s normal tab order before reaching the body-teleported rows. Blurring the trigger starts the 120 ms dismissal timer, so the preview closes before keyboard users can reach a row. The tests dispatch key events directly and don’t test Tab navigation. Add focus management and test the actual keyboard sequence; also associate the trigger with the preview rather than only the assignment panel.
- **Native tooltip on the agent trigger** — `TaskCard.vue:1535`: the icon still has `title="Show agent assignments"`, so hovering it can show a native tooltip alongside the shared preview, contrary to E2’s no-native-title criterion.

## Edge cases
The engineering report describes commit `36f39f662`, not reviewed HEAD `244465d2c`, so its claims are stale and were not treated as evidence. `merge-tree` found only the task’s own work-file conflict; no source conflicts.

## Suggestions
Recapture on the reviewed HEAD: `default-2.png` does not show the popover, and the existing captures predate HEAD. Held, error, human-step, and check-wait cards share the same blurb; the Details link is removed for that shared component.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

