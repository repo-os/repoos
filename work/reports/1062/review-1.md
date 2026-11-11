---
task: "1062"
pass: 1
at: "2026-11-10T07:22:32.040Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/same-activity-animation-on-pipeline-card
state: ok
tree_identity: "ced38c31d:1460d85fb"
---
## Relevance
still relevant — The base branch still lacks Pipeline activity animation and visibility-aware pausing.

## Evidence
None

## Bugs
- **Overlay visibility:** `src/ui-app/src/lib/activity-motion.ts:87-99` gates motion only on viewport intersection. Indicators on the still-mounted view continue animating beneath TaskDrawer dialogs and other overlays; the observer has no occlusion or overlay-state signal.
- **View lifecycle / scroll preservation:** `src/ui-app/src/views/WorkView.vue:466-468` unmounts each view on toggle. The saved mode does not save scroll position, and `BoardColumn` keeps `scrollTop` only in component state, so returning resets the Board and Pipeline scroll positions.
- **Compact Settings layout:** `src/ui-app/src/style.css:4833-39` lets the cap column size to its content. In the On capture, this leaves the Style and Size help text wrapping across several lines, contrary to the one-line descriptions requirement.

## Edge cases
The captures are route-matched and nonblank; Pipeline shows the Bird quick-trail indicator, and Settings shows the On and Off states. The handoff recorded zero console errors. The requested 30-card `getAnimations()`/heap or layer measurements were not reported; the tests assert paused classes, not those counts. The Pipeline capture demonstrates one style, not every configured style.

## Suggestions
None found

## Verdict
needs some work — overlays do not pause motion, view switching resets scroll, and Settings help text still wraps.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-10T07:15:46.497Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

