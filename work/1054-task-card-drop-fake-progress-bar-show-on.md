---
id: 1054
title: "Task card: drop fake progress bar, show one checks status line"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/task-card-drop-fake-progress-bar-show-on
cli_override: cursor
model_override: composer-2.5
review_cli_override: codex
review_model_override: terra
created_at: "2026-11-07T13:16:10Z"
updated_at: "2026-11-07T13:18:46Z"
---
## Problem
After #1047, the Active task card is too busy while checks run, and the green bar is misleading. `checkProgressPercent()` (src/ui-app/src/lib/check-progress.ts) only returns a number when the server reports step counts or test-file counts. When a handoff reuses an earlier check ("reused check 14098") or is in a handoff stage with no counts (e.g. "Checking review"), the bar falls back to the generic sliding animation, which says nothing the old animation didn't. The same state is also shown three times on the card: the bottom "RUNNING CHECKS · CHECK · 41s" hint, the bar + "Checking review · attempt 13", and (in the drawer) a "Checks failed" box whose badge contradicts its "running checks" line.

## Desired UX
1. Bar: render a filled bar only when there is a real fraction (steps or tests). With no real fraction render NO bar, only a text label. Never show a decorative sliding bar.
2. One status per card: remove the duplication between the bottom `tc-reviewing` "running checks" hint and the bar+label. Keep a single line, e.g. `Checks · step 3 of 9 · 41s`, or `Checks · reused earlier result · 41s` for the reuse case, or `Checks · starting…`.
3. Attempt number and machine appear only in the drawer, not on the card.
4. Drawer: while a handoff/check is running, the status badge must not say CHECKS FAILED (show "Checking…" or dim the stale failure) so it never contradicts the running box.
5. Reused checks are labelled "reused earlier check"; no bar.

## Acceptance criteria
- TaskCard.vue: no `is-indeterminate`/`check-progress-indeterminate` bar; bar only when `cardCheckProgressPercent != null`.
- Only one running-checks line on the card; attempt/machine removed from the card.
- TaskDrawer badge does not read CHECKS FAILED while a handoff or check is in flight.
- Tests updated/added (active-task-card, task-panel-card-label-match, handoff-status as needed); `repoos check --changed main` passes; UI rebuilt.
- Declare 1–2 `## Shots` (card during a counted check, card during a reused check).

## Notes for AI
Context: filed from review of #1047 screenshots (task #1049 mid-handoff, attempt 13, reused check). Keep scope to removing/merging UI; do not change server progress reporting. Follow AGENTS.md conventions (no native title tooltips, global classes in style.css).

## Activity

- 2026-11-07T13:16:10Z · created · njachowski@gmail.com
- 2026-11-07T13:16:13Z · cli_override, model_override, review_cli_override, review_model_override
- 2026-11-07T13:16:19Z · status inbox→ready
- 2026-11-07T13:16:21Z · status ready→active, branch
- 2026-11-07T13:18:46Z · message_queued at 2026-11-07T13:18:46.576Z
