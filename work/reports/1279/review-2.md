---
task: "1279"
pass: 2
at: "2026-11-22T12:30:35.431Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/easter-eggs-bundle-rename-review-history
state: ok
tree_identity: "714ecad2d:714ecad2d2"
---
## Relevance
still relevant — main retains the old header and board-card number chip.

## Evidence
None

## Bugs
- **Class: card content clipping** — `TaskCard.vue` lets the ID, compact type, hotfix badge and merge badge shrink simultaneously. At the 220px fixture width, a long-ID hotfix card clips both the ID and even `feat`; a review hotfix with a merge badge can clip all four labels.

No further findings of this class were found after grepping: TaskCard, HotfixBadge, card CSS and fixture tests.

## Edge cases
The earlier control-overflow and fit-invalidation findings were addressed. The screenshots show the new header and plain numbers; the console was clean. Static WebKit fixtures do not exercise live fitting.

## Suggestions
Add live-layout assertions for readable labels in combined badge states.

## Verdict
needs some work — narrow cards clip the task number and compact type label.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-22T12:28:53.995Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

