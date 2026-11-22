---
task: "1279"
pass: 6
at: "2026-11-22T14:32:15.624Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/easter-eggs-bundle-rename-review-history
state: ok
tree_identity: "1b473fb8c:283f0fdd71"
---
Repeated review classes: Fit invalidation and badge remeasurement were addressed; card clipping remains possible when the type is hidden. A human should examine this recurring fit fallback.

## Relevance
still relevant — main retains the old header and board-card number chip.

## Evidence
None

## Bugs
- **Class: card content clipping** — `TaskCard.vue:508,1745` removes the type entirely when it cannot fit, including for non-feature types. The requested top line must retain the type, with `feature` shortened to `feat` when needed.

No further findings of this class were found after grepping: TaskCard, HotfixBadge, card CSS, drawer, fixture store, tests and documentation.

## Edge cases
The WebKit fixtures serialize static markup, so they do not exercise live fitting; their 768px card width also does not represent the three-column board. The engineering report matches the implementation tree.

## Suggestions (non-blocking)
The current screenshots show the renamed header and plain numbers, with no console errors, but not long-ID fitting at all three widths. Verify those cases in a live headless browser.

## Verdict
needs some work — narrow cards can lose the required type label.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-22T14:30:40.009Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

