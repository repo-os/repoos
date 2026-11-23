---
task: "1279"
pass: 1
at: "2026-11-22T12:15:37.604Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/easter-eggs-bundle-rename-review-history
state: ok
tree_identity: "56df37940:b3c90a8212"
---
## Relevance
still relevant — the base branch retains both the old header and board-card number chip.

## Evidence
None

## Bugs
- **Class: card overflow** — `TaskCard.vue` makes the ID, hotfix badge and controls non-shrinking. A long ID with a hotfix badge and P1 can exceed a narrow card, clipping the robot or priority. The fixtures omit hotfix cards.
- **Class: fit invalidation** — `fitTopLine` watches neither `status` nor `hotfixTarget`, although they change the merge or hotfix badge width. A mounted card can retain a clipped `feature` or unnecessary `feat` because the observed row width does not change.

No further findings of this class were found after grepping: TaskCard, HotfixBadge, card CSS and card fixture tests.

## Edge cases
The WebKit fixtures render static markup, so they do not verify the live `feature`/`feat` switch or resizing.

## Suggestions
None found

## Verdict
needs some work — narrow cards can clip controls, and type fitting can become stale.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-22T12:14:14.031Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

