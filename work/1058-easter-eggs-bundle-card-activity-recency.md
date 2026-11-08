---
id: "1058"
title: "Easter eggs bundle: card activity recency on hover"
type: chore
status: active
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/easter-eggs-bundle-card-activity-recency
cli_override: cursor
model_override: composer-2.5
review_cli_override: codex
review_model_override: gpt-6-luna
created_at: "2026-11-08T02:51:17Z"
updated_at: "2026-11-08T05:00:04Z"
dev_error_count: 10
engineer_crash_log: "[{\"cli\":\"cursor\",\"model\":\"composer-2.5\",\"at\":\"2026-11-08T04:25:40.449Z\",\"kind\":\"dev-error\"},{\"cli\":\"cursor\",\"model\":\"composer-2.5\",\"at\":\"2026-11-08T04:26:55.142Z\",\"kind\":\"dev-error\"},{\"cli\":\"cursor\",\"model\":\"composer-2.5\",\"at\":\"2026-11-08T04:44:30.219Z\",\"kind\":\"dev-error\"}]"
---
## Items

- [ ] **E1 · Don't show "active just now / active N minutes ago" on running cards; show it on hover** (web) — The card status line (e.g. "CONFIRMING HANDOFF · ACTIVE JUST NOW", "CODING · ACTIVE 1M AGO") repeats a recency that is almost always "recent" and adds noise. Drop the "active …" suffix from the line; keep the state label only. Show the last-activity time in a styled hover/focus popup (and long-press on touch). Only surface recency in the line when the task is silent or stuck past the existing threshold ("SILENT 6M", "STUCK"). Source: human report 2026-11-08 (screenshot of #1057 and #1055 cards).

Each item below has the same parts: Problem, Desired UX, Acceptance criteria, Notes for AI. Edit one item at a time with `--section`; never resend the whole body. Add related small fixes as `E2`, `E3` before this bundle starts.

## E1 · Don't show "active just now / active N minutes ago" on running cards; show it on hover

### Problem
Board cards show a running state with a recency suffix, for example "CONFIRMING HANDOFF · ACTIVE JUST NOW" or "CODING · ACTIVE 1M AGO". For a task that is making progress the suffix is noise: it is nearly always "just now" or a few minutes, it lengthens the line so it wraps onto two lines (as on #1057 and #1055), and it hides the real signal, which is when a task has gone quiet.

### Desired UX
- For a running task that is not silent or stuck, the status line shows only the state ("Confirming handoff", "Coding", "Running checks · verify"), with no "active …" text.
- The last-activity time ("Active 3m ago", plus the timestamp) appears in a styled popover on hover and keyboard focus (and on tap or long-press on touch). No native `title` tooltip.
- When the task is silent or stuck past the existing thresholds, the line keeps showing the recency ("SILENT 6M", "STUCK · SILENT 6M"), as today, because there it is the useful signal.
- Same behaviour on the Pipeline card elapsed text where it shows the same recency suffix.

### Acceptance criteria
- Test: a running, recently active task's card line contains no "active" recency text and fits on one line at the normal card width.
- Test: hovering or focusing the status line shows the last-activity time in the popover.
- Test: a silent or stuck task still shows its "SILENT n" or "STUCK" recency in the line.
- Popover is keyboard- and touch-usable and uses the shared tooltip/popover component.

### Notes for AI
Find where the card hint appends "· ACTIVE <time> AGO" (the `tc-*` hint builder in `src/ui-app/src/components/TaskCard.vue`, around the hint/`cardHintUsesLineClamp` code) and reuse the shared styled tooltip/popover (AGENTS.md: no native `title`, use a styled keyboard- and touch-usable tooltip). Coordinate with #1057, which is rewriting the card status derivation; if #1057 has landed, build on its shared status function. Source: human report 2026-11-08.

## Shots
```json
[
{
"label": "Board card coding without inline active recency",
"target": "default",
"route": "/",
"selector": "[data-task-id=\"9999\"]",
"highlight": "[data-task-id=\"9999\"] [data-test-id=\"task-card-agent-hint\"]",
"state": "board:activeCoding"
},
{
"label": "Pipeline coding lane elapsed on hover",
"target": "default",
"route": "/work?tab=pipeline",
"selector": "[data-task-id=\"pipe-coding\"]",
"highlight": "[data-task-id=\"pipe-coding\"] .pl-step",
"steps": [
{
"hover": "[data-task-id=\"pipe-coding\"] .pl-step"
}
],
"state": "board:pipeline"
}
]
```

## Activity

- 2026-11-08T02:51:17Z · created · njachowski@gmail.com
- 2026-11-08T02:51:23Z · cli_override, model_override, review_cli_override, review_model_override
- 2026-11-08T02:51:27Z · status inbox→ready
- 2026-11-08T02:52:24Z · model_override
- 2026-11-08T03:02:50Z · status ready→active, branch
- 2026-11-08T03:07:12Z · body
- 2026-11-08T03:23:29Z · agent exited with an error (cursor) · RetriableError: Connection stalled repeatedly
- 2026-11-08T03:23:59Z · engineer crash recovery: resuming cursor + composer-2.5 (1/12 crashes in 30m) · RetriableError: Connection stalled repeatedly
- 2026-11-08T03:24:00Z · needs_input
- 2026-11-08T03:24:00Z · agent exited with an error (cursor) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-08T03:25:00Z · engineer crash recovery: resuming cursor + composer-2.5 (2/12 crashes in 30m) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-08T03:25:01Z · needs_input
- 2026-11-08T03:25:02Z · agent exited with an error (cursor) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-08T03:26:32Z · engineer crash recovery: resuming cursor + composer-2.5 (3/12 crashes in 30m) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-08T03:26:33Z · needs_input
- 2026-11-08T03:26:33Z · agent exited with an error (cursor) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-08T03:36:53Z · engineer crash recovery: resuming cursor + composer-2.5 (4/12 crashes in 30m) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-08T03:36:53Z · needs_input
- 2026-11-08T03:36:54Z · agent exited with an error (cursor) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-08T03:53:09Z · engineer crash recovery: resuming cursor + composer-2.5 (5/12 crashes in 30m) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-08T03:53:11Z · needs_input
- 2026-11-08T03:53:12Z · agent exited with an error (cursor) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-08T04:10:18Z · engineer crash recovery: resuming cursor + composer-2.5 (6/12 crashes in 30m) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-08T04:10:19Z · needs_input
- 2026-11-08T04:10:20Z · agent exited with an error (cursor) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-08T04:25:37Z · engineer crash recovery: resuming cursor + composer-2.5 (2/12 crashes in 30m) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-08T04:25:39Z · needs_input
- 2026-11-08T04:25:40Z · agent exited with an error (cursor) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-08T04:26:52Z · engineer crash recovery: resuming cursor + composer-2.5 (2/12 crashes in 30m) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-08T04:26:54Z · needs_input
- 2026-11-08T04:26:55Z · agent exited with an error (cursor) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-08T04:44:27Z · engineer crash recovery: resuming cursor + composer-2.5 (3/12 crashes in 30m) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-08T04:44:29Z · needs_input
- 2026-11-08T04:44:30Z · agent exited with an error (cursor) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-08T05:00:03Z · engineer crash recovery: resuming cursor + composer-2.5 (3/12 crashes in 30m) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-08T05:00:04Z · needs_input
