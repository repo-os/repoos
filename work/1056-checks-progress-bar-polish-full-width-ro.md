---
id: "1056"
title: "Checks progress bar polish: full-width rounded on cards, half-width on panel and pipeline"
type: chore
status: active
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/checks-progress-bar-polish-full-width-ro
cli_override: cursor
model_override: composer-2.5
review_cli_override: codex
review_model_override: gpt-6-luna
created_at: "2026-11-08T00:15:51Z"
updated_at: "2026-11-08T02:57:57Z"
check_retry_count: 2
last_check_failure: "repoos check at 2026-11-08T02:52:07.694Z: repoos check failed: ui verification failed: timed out waiting for the task's browser capture"
dev_error_count: 5
---
## Problem
The checks progress bar added by #1054 works, but its styling and layout need polish in three places (see Nick's 2026-11-08 screenshots of #1055/#1044):
1. Board task card: the bar is not full width of the card, has square ends, and sits too close to the text under it.
2. Task drawer (panel) running-checks box: the bar is only about 1/4 of the box width and square-ended; the label "tests 208/684 files" floats centered to its right; the text line also repeats the host ("on remote host · remote host").
3. Pipeline card: the bar is a separate full row under the status text, which makes the card taller than its intended height.

## Desired UX
- Board card: the bar spans the full inner width of the card, with fully rounded ends (border-radius = half height, for both the track and the fill), and a little more vertical spacing (about 6-8px) between the bar and the info text below it.
- Drawer box: same rounded track and fill; the bar is HALF the width of the box (about 50%), with the label ("tests 208/684 files") on the SAME row, left-aligned in the right half next to the bar. Remove the duplicated "remote host" in the second line (show the machine once).
- Pipeline card: keep the card at its normal height. Put the progress bar in the status row, taking about HALF the card width, rounded, with the status text ("Confirming handoff 226/684" or the step label) in the other half to its right, all on ONE line. No extra row.
- One shared progress-bar component/class for all three so the rounded look stays consistent; only the width/layout differs per surface. When there is no real fraction there is no bar (unchanged).

## Acceptance criteria
- Card bar is full inner width, rounded caps on track and fill, with visible extra spacing above the info text.
- Drawer bar is about 50% of the box width, rounded, label on the same row; host shown once.
- Pipeline card height with the bar equals its height without it; bar ~50% width on the left, status text on the right, single line, text truncates with ellipsis instead of wrapping.
- Works in light and dark themes and at narrow widths (no overflow); fill with tiny values (e.g. 1%) still renders a visible rounded sliver (min width).
- Tests updated/added; declare shots for the card, the drawer box and the pipeline card in the counted case; `repoos check --changed main` passes; UI rebuilt.

## Notes for AI
Files: src/ui-app/src/components/TaskCard.vue (check-progress block), TaskDrawer.vue (running-checks box), PipelineCard.vue plus the shared styles in src/ui-app/src/style.css (check-progress-meter / progress). Use global classes in style.css, no native title tooltips. Reuse one shared meter class. Mind padding and hit areas.

## Shots
```json
[
{
"label": "Board card: full-width rounded check bar",
"target": "default",
"route": "/work?status=active",
"highlight": "[data-task-id=\"9999\"] [data-test-id=\"task-card-check-progress\"]",
"state": "card:checksProgress"
},
{
"label": "Drawer: half-width bar, detail on same row",
"target": "default",
"route": "/work?task=9999&tab=changes",
"highlight": "[data-test-id=\"close-out-check-progress\"]",
"state": "drawer:checksProgress"
},
{
"label": "Pipeline: bar and status on one row",
"target": "default",
"route": "/work?tab=pipeline",
"highlight": ".pl-row-3 [data-test-id=\"pipeline-card-check-progress\"]",
"state": "pipeline:checksProgress"
}
]
```

## Activity

- 2026-11-08T00:15:51Z · created · njachowski@gmail.com
- 2026-11-08T00:15:55Z · cli_override, model_override, review_cli_override, review_model_override
- 2026-11-08T00:15:58Z · status inbox→ready
- 2026-11-08T00:27:22Z · cli_override, model_override
- 2026-11-08T00:30:28Z · cli_override, model_override, review_model_override
- 2026-11-08T01:38:36Z · status ready→active, branch
- 2026-11-08T01:41:56Z · body
- 2026-11-08T01:45:00Z · body
- 2026-11-08T01:50:13Z · body
- 2026-11-08T01:50:19Z · body
- 2026-11-08T01:58:23Z · agent exited with an error (cursor) · RetriableError: Connection failed repeatedly
- 2026-11-08T01:58:23Z · engineer crash recovery: resuming cursor + composer-2.5 (1/3 crashes in 30m) · RetriableError: Connection failed repeatedly
- 2026-11-08T01:58:24Z · needs_input
- 2026-11-08T01:58:24Z · agent exited with an error (cursor) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-08T01:59:24Z · engineer crash recovery: resuming cursor + composer-2.5 (2/12 crashes in 30m) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-08T01:59:25Z · needs_input
- 2026-11-08T01:59:25Z · agent exited with an error (cursor) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-08T02:00:55Z · engineer crash recovery: resuming cursor + composer-2.5 (3/12 crashes in 30m) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-08T02:00:57Z · needs_input
- 2026-11-08T02:00:58Z · agent exited with an error (cursor) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-08T02:02:58Z · engineer crash recovery: resuming cursor + composer-2.5 (4/12 crashes in 30m) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-08T02:03:00Z · needs_input
- 2026-11-08T02:03:01Z · agent exited with an error (cursor) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-08T02:05:31Z · engineer crash recovery: resuming cursor + composer-2.5 (5/12 crashes in 30m) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-08T02:05:32Z · needs_input
- 2026-11-08T02:07:49Z · body
- 2026-11-08T02:08:19Z · body
- 2026-11-08T02:08:35Z · body
- 2026-11-08T02:13:14Z · CTO nudge: held — handoff gate is running
- 2026-11-08T02:38:40Z · message_queued at 2026-11-08T02:38:40.452Z
- 2026-11-08T02:38:43Z · message_delivered: 1 message(s)
- 2026-11-08T02:43:14Z · CTO nudge: held — remote validation is running
- 2026-11-08T02:44:50Z · body
- 2026-11-08T02:49:04Z · body
- 2026-11-08T02:51:29Z · CTO nudge: held — handoff gate is running
- 2026-11-08T02:52:04Z · message_queued at 2026-11-08T02:52:04.602Z
- 2026-11-08T02:52:07Z · message_delivered: 1 message(s)
- 2026-11-08T02:52:19Z · CTO nudge: held — remote validation is running
- 2026-11-08T02:52:22Z · review_model_override
- 2026-11-08T02:57:57Z · note: ui verification passed: 3 of 3 shots captured with clean console
- 2026-11-08T02:57:57Z · engineer stopped by request
