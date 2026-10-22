---
id: "0847"
title: "Easter eggs bundle: hide the \"0 changes\" chip on task cards"
type: chore
status: done
priority: p3
area: web
merged_commit: d8b8bc84d6020aba373f6d87081feb878a9b29d3
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/easter-eggs-bundle-hide-the-0-changes-ch
cli_override: github copilot
model_override: default
review_cli_override: pi
review_model_override: "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free"
created_at: "2026-10-19T07:50:02Z"
updated_at: "2026-10-22T11:36:29Z"
last_close_out_gate_ms: 344353
last_close_out_gate_at: "2026-10-19T16:00:42.308Z"
review_passes: 1
---
## Items

- [ ] **E1 · No "0 changes" chip on task cards** (web) — show the file-count chip only when a task has file or code changes; show nothing at zero. Source: Nick 2026-10-19, screenshot of #0794's card.
- [ ] **E2 · Empty Draft column shows a dash, not help text** (web) — Replace the empty Draft column text 'No drafts yet. Agent proposals land here.' (DRAFT_EMPTY in src/ui-app/src/views/WorkView.vue) with the same '-' placeholder the other empty columns use.. Source: Nick 2026-10-19, screenshot of the Work Queue.

Add further small, independent web fixes here with `repoos bundle add <id> ...` (one open bundle at a time).

## E1 · No "0 changes" chip on task cards

### Problem
A card for a task that has a branch but no changes yet shows a "0 changes" chip (screenshot: #0794, a human-only chore in Ready). It adds visual noise on exactly the cards that have nothing to say, and it carries a native `title="No code changes"` tooltip, which AGENTS.md forbids for new UI. The chip is the `v-else-if="diffStats && diffStats.filesChanged === 0 && task.branch"` span in `src/ui-app/src/components/TaskCard.vue` (~line 1127).

### Desired UX
- When a task has no file or code changes yet, the card shows **no** changes chip at all (no "0 changes", no empty placeholder, no reserved space that shifts the layout).
- When it has changes, the existing file-count chip (`FileText` icon + number, tooltip with files and +/- lines) is unchanged.
- Cards in every column (Ready, Active, Review, Done) and both themes behave the same; the row collapses cleanly when the chip is the only thing in it.

### Acceptance criteria
- Test: a card for a task with a branch and `filesChanged === 0` renders no changes chip and no "0 changes" text.
- Test: a card with `filesChanged > 0` still renders the file-count chip with its tooltip.
- Test: while diff stats are still loading (undefined) nothing flickers in.
- Declared shot of a board with a Ready human task that has a branch and no changes (use a real task id and an existing fixture, or add a `card:noChanges` fixture), light and dark; open the PNG to confirm no chip and no empty gap.
- Remove the now-unused `.diff-stats-empty` styles if nothing else uses them.

### Notes for AI
Smallest possible change: delete the `v-else-if` "0 changes" span and its CSS. Do not touch the `filesChanged > 0` chip. Never touch repoos.toml.


## E2 · Empty Draft column shows a dash, not help text

### Problem
The empty Draft column on the Work Queue page shows the help text "No drafts yet. Agent proposals land here." while every other empty column shows a plain dash (—). The text is the DRAFT_EMPTY constant in src/ui-app/src/views/WorkView.vue (line 41), used as the empty-text at lines ~350 and ~360.
### Desired UX
The empty Draft column shows exactly what the other empty columns show: the same dash placeholder (the '—' already passed as empty-text for the other columns). No help text. A Draft column that has drafts is unchanged.
### Acceptance criteria

- Test: The empty Draft column renders the same dash as the other empty columns and no 'No drafts yet' text; a non-empty Draft column is unchanged; existing tests referencing the old copy are updated.

### Notes for AI
Remove DRAFT_EMPTY and use the same placeholder as the other columns at both call sites (the main board and the filtered single-column view). Grep tests and docs for the old copy and update them. Never touch repoos.toml.
## Problem
See E1: the card shows a "0 changes" chip when there is nothing to show.

## Desired UX
No changes chip at all until a task has file or code changes (see E1).

## Acceptance criteria
See E1 (and the E-sections of any items added later); all items must hold.

## Notes for AI
Items are independent; edit them with `repoos bundle edit`, never a full `--body`. Never touch repoos.toml.

## Shots
```json
[
{
"label": "Ready human task with no changes chip (light)",
"target": "default",
"route": "/work?status=ready",
"highlight": "[data-task-id=\"9999\"]",
"steps": [
{
"waitFor": "[data-task-id=\"9999\"] .tc-human-chip"
}
],
"assert": [
{
"selector": "[data-task-id=\"9999\"] .tc-file-chip",
"label": "no file-change chip is rendered",
"count": 0
}
],
"state": "card:noChanges",
"theme": "light"
},
{
"label": "Ready human task with no changes chip (dark)",
"target": "default",
"route": "/work?status=ready",
"highlight": "[data-task-id=\"9999\"]",
"steps": [
{
"waitFor": "[data-task-id=\"9999\"] .tc-human-chip"
}
],
"assert": [
{
"selector": "[data-task-id=\"9999\"] .tc-file-chip",
"label": "no file-change chip is rendered",
"count": 0
}
],
"state": "card:noChanges",
"theme": "dark"
}
]
```

## Activity

- 2026-10-19T07:50:02Z · created · njachowski@gmail.com
- 2026-10-19T08:05:29Z · body: Items (added 1); E2 · Empty Draft column shows a dash, not help text (added)
- 2026-10-19T08:05:29Z · note: bundle add E2
- 2026-10-19T08:05:42Z · body: E2 · Empty Draft column shows a dash, not help text (added 1)
- 2026-10-19T08:05:42Z · note: bundle edit E2
- 2026-10-19T08:05:47Z · body: E2 · Empty Draft column shows a dash, not help text (added 1)
- 2026-10-19T08:05:47Z · note: bundle edit E2
- 2026-10-19T08:05:52Z · body: E2 · Empty Draft column shows a dash, not help text (added 1)
- 2026-10-19T08:05:52Z · note: bundle edit E2
- 2026-10-19T09:42:07Z · status inbox→ready
- 2026-10-19T13:19:57Z · cli_override, model_override
- 2026-10-19T13:20:03Z · review_cli_override, review_model_override
- 2026-10-19T13:21:36Z · review_model_override
- 2026-10-19T13:21:37Z · status ready→active, branch
- 2026-10-19T13:24:42Z · body
- 2026-10-19T13:26:11Z · body
- 2026-10-19T13:36:31Z · handoff failed · remote validation failed: test failure: tests/board-column-labels.test.ts > DashboardView column labels > uses original labels by default (no config) on bee — fix it in the feature branch and re-run the gate
- 2026-10-19T13:36:31Z · handoff failed · handoff recovery attempted · finalization failed
- 2026-10-19T13:42:06Z · watchdog: auto-surfaced stuck task · status active→review · handoff recovery was attempted after an interrupted turn but finalization failed — manual intervention needed · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-10-19T13:42:06Z · note: handoff requested (cli)
- 2026-10-19T13:48:30Z · handoff failed · task-file handoff failed at check · remote validation failed: test failure: tests/board-column-labels.test.ts > DashboardView column labels > uses original labels by default (no config) on bee — fix it in the feature branch and re-run the gate
- 2026-10-19T13:55:07Z · CTO action: restart-stalled-agent (resume) · handoff recovery was attempted after an interrupted turn but finalization failed — manual intervention needed
- 2026-10-19T13:56:23Z · body
- 2026-10-19T13:57:04Z · body
- 2026-10-19T14:04:19Z · handoff failed · remote validation failed: test failure: tests/board-column-labels.test.ts > DashboardView column labels > uses original labels by default (no config) on bee — fix it in the feature branch and re-run the gate
- 2026-10-19T14:10:06Z · CTO action: restart-stalled-agent (resume) · handoff recovery was attempted after an interrupted turn but finalization failed — manual intervention needed
- 2026-10-19T14:14:16Z · body
- 2026-10-19T14:14:58Z · body
- 2026-10-19T14:16:53Z · body
- 2026-10-19T14:24:12Z · handoff failed · remote validation failed: test failure: tests/board-column-labels.test.ts > DashboardView column labels > uses original labels by default (no config) on bee — fix it in the feature branch and re-run the gate
- 2026-10-19T14:30:06Z · CTO action: restart-stalled-agent (fresh) · handoff recovery was attempted after an interrupted turn but finalization failed — manual intervention needed
- 2026-10-19T14:31:58Z · body
- 2026-10-19T14:32:43Z · body
- 2026-10-19T14:41:09Z · handoff failed · remote validation failed: test failure: tests/board-column-labels.test.ts > DashboardView column labels > uses original labels by default (no config) on bee — fix it in the feature branch and re-run the gate
- 2026-10-19T14:51:12Z · CTO action: restart-stalled-agent (fresh) · handoff recovery was attempted after an interrupted turn but finalization failed — manual intervention needed
- 2026-10-19T14:52:35Z · body
- 2026-10-19T14:53:25Z · body
- 2026-10-19T15:00:13Z · handoff failed · remote validation failed: test failure: tests/board-column-labels.test.ts > DashboardView column labels > uses original labels by default (no config) on bee — fix it in the feature branch and re-run the gate
- 2026-10-19T15:05:23Z · message_queued at 2026-10-19T15:05:23.921Z
- 2026-10-19T15:05:24Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-19T15:06:36Z · body
- 2026-10-19T15:08:46Z · body
- 2026-10-19T15:25:20Z · body
- 2026-10-19T15:39:48Z · body
- 2026-10-19T15:48:13Z · status active→review
- 2026-10-19T15:49:35Z · note: review pass 1: good to go
- 2026-10-19T16:00:42Z · close-out gate completed in 344s
- 2026-10-19T16:01:17Z · status review→done, release:success
- 2026-10-19T16:19:54Z · message_overdue: still queued after 60m without being delivered
- 2026-10-19T19:46:47Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T04:26:30Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T11:08:20Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T15:31:56Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T16:09:58Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T17:21:45Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T18:33:41Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T19:47:06Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T20:10:44Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T21:10:05Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T21:57:02Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T22:12:33Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T23:15:30Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T23:17:43Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T00:05:53Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T01:05:51Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T02:04:03Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T04:15:07Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T08:22:55Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T11:51:32Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T11:59:36Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T13:14:35Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T14:32:42Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T16:04:34Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T16:53:29Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T18:00:35Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T18:10:52Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T18:42:37Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T19:37:30Z · message_overdue: still queued after 60m without being delivered
- 2026-10-22T01:39:28Z · message_overdue: still queued after 60m without being delivered
- 2026-10-22T01:48:04Z · message_overdue: still queued after 60m without being delivered
- 2026-10-22T02:15:35Z · message_overdue: still queued after 60m without being delivered
- 2026-10-22T04:26:35Z · message_overdue: still queued after 60m without being delivered
- 2026-10-22T07:48:48Z · message_overdue: still queued after 60m without being delivered
- 2026-10-22T08:39:38Z · message_overdue: still queued after 60m without being delivered
- 2026-10-22T11:36:29Z · message_overdue: still queued after 60m without being delivered
