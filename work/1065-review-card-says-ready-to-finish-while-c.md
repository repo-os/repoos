---
id: "1065"
title: Review card says 'ready to finish' while checks are still running or failing
type: bug
status: inbox
paths: [src/ui-app/src/components/TaskCard.vue, src/ui-app/src/components/TaskDrawer.vue]
priority: p2
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-11-08T13:12:26Z"
updated_at: "2026-11-08T13:12:26Z"
---
## Problem
On the Work board, a task in Review whose reviewer said "good to go" shows the green "Review passed · ready to finish" label, a glowing card and an active "Move to done" button. The task drawer for the same task can say "Not ready to merge: Running checks · 7m 21s, step 10 of 11" at the same moment (seen on #1063). The two disagree.

Cause: `reviewReady` and the review hint in `TaskCard.vue` (~1055-1105, ~1257) only consider the review verdict, the reviewer/engineer running and the close-out queue. They never look at the landability result the drawer uses (`landable`, `TaskDrawer.vue` ~976) or at a post-review check run in flight. Related case: #1059 showed "Review still finding issues" with an equally live-looking Move to done button.

## Desired UX
- While landability is not green (checks running, check failed, handoff stale), the card does not use the green "ready to finish" glow and label. It shows the real state instead, e.g. "Review passed · checks running" or "Review passed · checks failed".
- The card's Move to done button is dimmed/inert with a short reason while checks are running, matching the drawer; when landability turns green the glow and label appear without a reload.
- When review verdict is not green (amber/red), the button is not highlighted as the primary action.
- Card and drawer read from the same landability source so they cannot disagree.

## Acceptance criteria
- Card and drawer agree on ready/not-ready for a review task in these states: checks running, checks failed, landable green, verdict amber, verdict red.
- Component tests for each state (label, glow class, button disabled).
- A screenshot declared via `repoos update <id> --shots` showing the card with checks running.
- No change to close-out itself; Move to done still enqueues the normal pipeline.

## Notes for AI
Confirm first whether Move to done is already rejected server-side while checks run (see `repoos landable <id>` and docs/close-out-pipeline.md); if so, the card should just mirror that. Do not widen close-out gates here; this is display/button state only. Use the existing dimmed-footer classes (`actionFooterClass` `inert`) instead of new styles.

## Activity

- 2026-11-08T13:12:26Z · created · njachowski@gmail.com
