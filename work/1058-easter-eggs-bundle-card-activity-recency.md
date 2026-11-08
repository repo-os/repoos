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
review_cli_override: github copilot
review_model_override: default
created_at: "2026-11-08T02:51:17Z"
updated_at: "2026-11-08T12:23:46Z"
check_retry_count: 2
last_check_failure: "repoos check at 2026-11-08T10:53:19.645Z: repoos check failed: ui verification failed: timed out waiting for the task's browser capture"
last_handoff_failure_fingerprint: check|server-side finalization timed out (deadline exceeded)
last_handoff_failure_sha: a0794a6e8b42bec618845a4f471f84e81ecfdf4c
review_rounds: 1
review_passes: 1
dev_error_count: 16
engineer_crash_log: "[{\"cli\":\"cursor\",\"model\":\"composer-2.5\",\"at\":\"2026-11-08T11:17:44.938Z\",\"kind\":\"dev-error\"},{\"cli\":\"cursor\",\"model\":\"composer-2.5\",\"at\":\"2026-11-08T11:18:29.254Z\",\"kind\":\"dev-error\"},{\"cli\":\"cursor\",\"model\":\"composer-2.5\",\"at\":\"2026-11-08T11:20:59.443Z\",\"kind\":\"dev-error\"},{\"cli\":\"cursor\",\"model\":\"composer-2.5\",\"at\":\"2026-11-08T11:22:30.986Z\",\"kind\":\"dev-error\"}]"
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
"label": "Board hint: coding line and hover recency",
"target": "default",
"route": "/work",
"highlight": ".app-tooltip.show",
"steps": [
{
"waitFor": "[data-task-id=\"9999\"] [data-test-id=\"task-card-agent-hint\"]"
},
{
"hover": "[data-task-id=\"9999\"] [data-test-id=\"task-card-agent-hint\"]"
},
{
"waitMs": 1200
},
{
"waitFor": ".app-tooltip.show"
}
],
"state": "board:activeCoding"
},
{
"label": "Pipeline ok card hides inline elapsed",
"target": "default",
"route": "/work?tab=pipeline",
"selector": "[data-task-id=\"pipe-coding\"]",
"highlight": "[data-task-id=\"pipe-coding\"] .pl-step",
"steps": [
{
"waitFor": "[data-task-id=\"pipe-coding\"]"
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
- 2026-11-08T05:00:05Z · agent exited with an error (cursor) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-08T05:17:11Z · engineer crash recovery: resuming cursor + composer-2.5 (2/12 crashes in 30m) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-08T05:34:24Z · watchdog: restarting engineer after 17m with no live process
- 2026-11-08T05:41:44Z · body
- 2026-11-08T05:41:52Z · body
- 2026-11-08T05:42:38Z · body
- 2026-11-08T05:53:12Z · message_queued at 2026-11-08T05:53:12.397Z
- 2026-11-08T05:53:12Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-08T05:53:38Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-08T05:57:17Z · agent exited with an error (cursor) · RetriableError: Agent turn stopped after repeated resume attempts made no progress
- 2026-11-08T05:57:17Z · engineer crash recovery: resuming cursor + composer-2.5 (1/3 crashes in 30m) · RetriableError: Agent turn stopped after repeated resume attempts made no progress
- 2026-11-08T06:00:21Z · needs_input
- 2026-11-08T06:00:21Z · message_delivered: 1 message(s)
- 2026-11-08T06:01:25Z · body
- 2026-11-08T06:18:14Z · note: adopted orphaned engineer pid 26761
- 2026-11-08T06:36:46Z · body
- 2026-11-08T06:48:05Z · body
- 2026-11-08T06:53:14Z · CTO nudge: held — handoff gate is running
- 2026-11-08T07:13:04Z · note: ui verification failed: ui verification failed (10 issue(s)): [missing-target] Board card coding without inline active recency (target "default"): state "board:activeCoding" did not render on target "default" — / shows no task card (http://127.0.0.1:42935/?shotState=board%3AactiveCoding); [missing-target] Board card coding without inline active recency (target "default"): highlight [data-task-id="9999"] [data-test-id="task-card-agent-hint"] matched nothing on / (http://127.0.0.1:42935/?shotState
- 2026-11-08T07:13:04Z · message_queued at 2026-11-08T07:13:04.395Z
- 2026-11-08T07:13:07Z · message_delivered: 1 message(s)
- 2026-11-08T07:13:47Z · body
- 2026-11-08T07:23:14Z · message_queued at 2026-11-08T07:23:14.412Z
- 2026-11-08T07:23:14Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-08T07:28:14Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-08T07:35:29Z · body
- 2026-11-08T07:38:14Z · CTO nudge: held — handoff gate is running
- 2026-11-08T08:03:10Z · note: ui verification passed: 3 of 3 shots captured with clean console
- 2026-11-08T08:03:11Z · status active→review
- 2026-11-08T08:03:11Z · message_queued at 2026-11-08T08:03:11.708Z
- 2026-11-08T08:04:18Z · note: review pass 1: needs some work
- 2026-11-08T08:04:18Z · message_delivered: 1 message(s)
- 2026-11-08T08:04:19Z · status review→active
- 2026-11-08T08:04:21Z · CTO nudge: held — remote validation is running
- 2026-11-08T08:21:20Z · body
- 2026-11-08T08:23:07Z · CTO nudge: held — handoff gate is running
- 2026-11-08T08:42:56Z · note: ui verification passed: 3 of 3 shots captured with clean console
- 2026-11-08T08:42:57Z · status active→review
- 2026-11-08T08:42:57Z · message_queued at 2026-11-08T08:42:57.341Z
- 2026-11-08T08:45:22Z · review_cli_override, review_model_override
- 2026-11-08T09:22:56Z · status review→active
- 2026-11-08T09:22:59Z · CTO nudge: held — review is running
- 2026-11-08T09:23:05Z · note: handoff requested (cli)
- 2026-11-08T09:24:09Z · CTO nudge: held — handoff gate is running
- 2026-11-08T09:51:26Z · message_overdue: still queued after 60m without being delivered
- 2026-11-08T09:53:05Z · message_queued at 2026-11-08T09:53:05.247Z
- 2026-11-08T09:53:05Z · handoff failed · task-file handoff failed at check · server-side finalization timed out (deadline exceeded)
- 2026-11-08T09:53:05Z · message_delivered: 2 message(s)
- 2026-11-08T09:53:13Z · note: ui verification passed: 3 of 3 shots captured with clean console
- 2026-11-08T09:53:18Z · CTO nudge: held — review is running
- 2026-11-08T10:03:00Z · body
- 2026-11-08T10:04:09Z · CTO nudge: held — handoff gate is running
- 2026-11-08T10:33:41Z · message_queued at 2026-11-08T10:33:41.849Z
- 2026-11-08T10:34:09Z · CTO nudge: held — review is running
- 2026-11-08T10:35:52Z · message_delivered: 1 message(s)
- 2026-11-08T10:46:38Z · body
- 2026-11-08T10:50:58Z · CTO nudge: held — handoff gate is running
- 2026-11-08T10:53:16Z · message_queued at 2026-11-08T10:53:16.598Z
- 2026-11-08T10:53:22Z · note: ui verification passed: 3 of 3 shots captured with clean console
- 2026-11-08T10:54:09Z · CTO nudge: held — review is running
- 2026-11-08T10:59:11Z · watchdog: restarted engineer after identical check failure · branch tip unchanged since the last failing handoff validation
- 2026-11-08T10:59:11Z · message_queued at 2026-11-08T10:59:11.737Z
- 2026-11-08T11:07:12Z · message_delivered: 1 message(s)
- 2026-11-08T11:08:39Z · body
- 2026-11-08T11:17:44Z · agent exited with an error (cursor) · RetriableError: Connection stalled repeatedly
- 2026-11-08T11:18:14Z · engineer crash recovery: resuming cursor + composer-2.5 (1/12 crashes in 30m) · RetriableError: Connection stalled repeatedly
- 2026-11-08T11:18:15Z · needs_input
- 2026-11-08T11:18:15Z · message_delivered: 1 message(s)
- 2026-11-08T11:18:29Z · agent exited with an error (cursor) · Error: [unavailable] read ETIMEDOUT
- 2026-11-08T11:19:29Z · engineer crash recovery: resuming cursor + composer-2.5 (2/12 crashes in 30m) · Error: [unavailable] read ETIMEDOUT
- 2026-11-08T11:19:30Z · needs_input
- 2026-11-08T11:20:59Z · agent exited with an error (cursor) · Error: [unavailable] read ETIMEDOUT
- 2026-11-08T11:22:29Z · engineer crash recovery: resuming cursor + composer-2.5 (3/12 crashes in 30m) · Error: [unavailable] read ETIMEDOUT
- 2026-11-08T11:22:30Z · needs_input
- 2026-11-08T11:22:30Z · agent exited with an error (cursor) · Error: [internal]
- 2026-11-08T11:22:30Z · engineer crash recovery: surfaced instead of switching — a human-set task override (cursor + composer-2.5) is pinned, so RepoOS did not replace it (4/3 crashes in 30m)
- 2026-11-08T12:23:46Z · needs_input
