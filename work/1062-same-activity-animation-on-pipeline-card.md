---
id: "1062"
title: Same activity animation on Pipeline cards as Board cards; pause animations when not visible
type: chore
status: active
priority: p2
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/same-activity-animation-on-pipeline-card
cli_override: cursor
model_override: composer-2.5
review_cli_override: github copilot
review_model_override: default
created_at: "2026-11-08T09:13:53Z"
updated_at: "2026-11-10T12:35:36Z"
last_handoff_failure_fingerprint: "check|repoos check failed: check-fmt:check — Formatting failed — run `bun run fmt` to fix:"
last_handoff_failure_sha: c03fefe9eddc852051a4889c4721fbb92f433259
review_rounds: 1
review_passes: 1
handoff_signal_retry_count: 2
last_check_failure: "repoos check at 2026-11-10T01:31:27.569Z: repoos check failed: ui verification failed (2 issue(s)): [request] HTTP 405 for http://127.0.0.1:44143/api/config (http://127.0.0.1:44143/api/config); [request] Failed to load resource: the server responded with a status of 405 (Method Not Allowed) (http://127.0.0.1:44143/api/config)"
dev_error_count: 8
deferred_handoff_resume_count: 1
---
## Problem
1. The card activity animation chosen in Settings (activity animation style and size, via `ActivityIndicator.vue`) shows on Board cards (`TaskCard.vue` uses it 7 times) but NOT on Pipeline cards: `PipelineCard.vue` does not use `ActivityIndicator` at all and shows only a plain status dot. The same running task looks alive on one view and static on the other, and the Settings choice is ignored in Pipeline.
2. Animations keep running when they cannot be seen. `ActivityIndicator.vue` has no visibility handling (no `visibilitychange`, no `IntersectionObserver`, no `animation-play-state` control), so animations on the non-visible view (the Board while Pipeline is shown, or the reverse), in collapsed columns, off-screen cards, hidden browser tabs, and behind drawers and dialogs still run and cost CPU and memory (compositor layers, JS timers).

## Desired UX
1. Pipeline cards show the same Settings-selected activity animation (style and size) as Board cards wherever the Board card shows it for the same state (coding, running checks, reviewing, etc.). Use the shared `ActivityIndicator` component, not a copy. The Pipeline dot is replaced by (or wraps) it without changing the card height.
2. Animations run only while visible: paused (CSS `animation-play-state: paused`, no JS timers or rAF loops, no will-change layers) when the document is hidden, the card is outside the viewport, its column is collapsed, or its whole view is not the active one. Resume immediately when visible again. Implement once in the shared component (one shared `IntersectionObserver` plus a single `visibilitychange` listener, not one per card).
3. The non-active view (Board vs Pipeline) should not keep rendering or animating its cards: unmount it or mark it `v-show` hidden with animations paused, whichever the router/view setup allows without losing scroll state.
4. Respect `prefers-reduced-motion`.
5. Settings > General > Activity animation gets an explicit On/Off toggle at the top of the card. Today the only way to stop animation is to set "Animated indicators at once" to 0, which nobody finds. When Off, every activity indicator (Board cards, Pipeline cards, Dev page, drawer) shows only the plain colored status dot, with no motion and no animation timers. The toggle persists like the other activity animation settings (same store and keys; if it needs a new key, add it to `getConfigSchema()` with a test, no hand edit of `repoos.toml`).
6. Make the Activity animation card compact to save vertical space: when Off, hide the style picker, size slider, max-indicators control and the three preview rows (show only the toggle and a one-line explanation); when On, put the style picker, size slider and "Animated indicators at once" number in one compact row/grid, shorten the descriptions to one line each, and show the three preview labels (Coding, Reviewing, Agent working) inline on one row instead of stacked.
7. The existing "Animated indicators at once" cap (default 6) must count only VISIBLE indicators: indicators on a hidden view, collapsed column or off-screen card must not occupy cap slots, so visible running cards always get animated first.

## Acceptance criteria
- Test: Pipeline card for a running task renders `ActivityIndicator` with the configured style and size; a non-running task does not animate.
- Test: when `document.hidden` is true, or the card is not intersecting, or its column is collapsed, the indicator reports paused (computed `animation-play-state: paused` or the paused class); it resumes when visible.
- Test: only one shared observer and one `visibilitychange` listener exist regardless of card count.
- Test: the hidden view (Board while on Pipeline) has no running animations.
- Measure and report: number of running CSS animations (`document.getAnimations().length`) with 30 cards on the visible view and on the hidden view before and after, plus JS heap or layer count if available.
- Test: with the toggle Off, all indicators render the plain dot with no animation and the card shows only the toggle; with it On, the controls show in the compact layout.
- Test: hidden indicators do not use up the "animated at once" cap.
- Shots: Pipeline cards with each animation style, and the compact Settings card in the On and Off states; `repoos check --changed main` passes; do NOT edit `repoos.toml`.

## Notes for AI
Files: `src/ui-app/src/components/ActivityIndicator.vue`, `PipelineCard.vue`, `TaskCard.vue`, `src/ui-app/src/views/WorkView.vue` and `PipelineView.vue` (how the two views are mounted), the Settings keys for activity animation in `src/core/config.ts` and `SettingsView.vue`. Reuse the existing styled components and global classes in `style.css`; no native tooltips.

## Shots
```json
[
{
"label": "Pipeline cards with activity animation",
"target": "default",
"route": "/work",
"highlight": ".pipeline-card .pl-activity",
"state": "board:pipeline"
},
{
"label": "Settings activity animation compact (on)",
"target": "default",
"route": "/settings?tab=general&section=activity-animation",
"highlight": "#settings-section-activity-animation",
"state": "settings:birdQuickTrail"
},
{
"label": "Settings activity animation motion off",
"target": "default",
"route": "/settings?tab=general&section=activity-animation",
"highlight": "#setting-activityAnimationEnabled",
"state": "settings:motionOff"
}
]
```

## Activity

- 2026-11-08T09:13:53Z · created · njachowski@gmail.com
- 2026-11-08T09:13:53Z · needs_input
- 2026-11-08T09:14:00Z · body
- 2026-11-08T09:14:01Z · needs_input, cli_override, model_override, review_cli_override, review_model_override
- 2026-11-08T09:14:07Z · body: Desired UX (added); Desired behavior (removed)
- 2026-11-08T09:14:09Z · status inbox→ready
- 2026-11-08T09:19:43Z · body: Desired UX (added 4, removed 1); Acceptance criteria (added 3, removed 1)
- 2026-11-09T22:28:23Z · status ready→active, branch
- 2026-11-09T22:50:40Z · message_queued at 2026-11-09T22:50:40.314Z
- 2026-11-09T22:50:40Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-09T22:51:41Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-09T23:07:17Z · body
- 2026-11-09T23:07:33Z · body
- 2026-11-09T23:43:50Z · agent exited with an error (cursor) · RetriableError: Connection failed repeatedly
- 2026-11-09T23:43:50Z · engineer crash recovery: resuming cursor + composer-2.5 (1/3 crashes in 30m) · RetriableError: Connection failed repeatedly
- 2026-11-09T23:47:01Z · needs_input
- 2026-11-09T23:47:01Z · message_delivered: 1 message(s)
- 2026-11-09T23:47:05Z · agent exited with an error (cursor) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-10T00:03:53Z · engineer crash recovery: resuming cursor + composer-2.5 (2/12 crashes in 30m) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-10T00:39:44Z · watchdog: restarting engineer after 33m with no live process
- 2026-11-10T00:39:53Z · agent exited with an error (cursor) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-10T00:40:23Z · engineer crash recovery: resuming cursor + composer-2.5 (1/12 crashes in 30m) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-10T00:40:27Z · needs_input
- 2026-11-10T00:42:27Z · agent exited with an error (cursor) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-10T00:43:28Z · engineer crash recovery: resuming cursor + composer-2.5 (2/12 crashes in 30m) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-10T00:43:31Z · needs_input
- 2026-11-10T00:46:31Z · agent exited with an error (cursor) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-10T00:48:01Z · engineer crash recovery: resuming cursor + composer-2.5 (3/12 crashes in 30m) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-10T00:48:06Z · needs_input
- 2026-11-10T01:04:37Z · body
- 2026-11-10T01:16:22Z · CTO nudge: held — handoff gate is running
- 2026-11-10T01:31:19Z · note: ui verification failed: ui verification failed (2 issue(s)): [request] HTTP 405 for http://127.0.0.1:44143/api/config (http://127.0.0.1:44143/api/config); [request] Failed to load resource: the server responded with a status of 405 (Method Not Allowed) (http://127.0.0.1:44143/api/config)
- 2026-11-10T01:31:20Z · message_queued at 2026-11-10T01:31:20.449Z
- 2026-11-10T01:31:21Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-10T01:36:39Z · message_queued at 2026-11-10T01:36:39.227Z
- 2026-11-10T01:41:54Z · message_queued at 2026-11-10T01:41:54.313Z
- 2026-11-10T01:47:07Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-11-10T01:47:07Z · note: handoff requested (cli)
- 2026-11-10T01:51:21Z · CTO nudge: held — handoff gate is running
- 2026-11-10T02:01:19Z · message_delivered: 1 message(s)
- 2026-11-10T02:03:24Z · body
- 2026-11-10T02:03:51Z · body
- 2026-11-10T02:04:54Z · note: ui verification failed: ui verification failed (2 issue(s)): [request] HTTP 405 for http://127.0.0.1:41675/api/config (http://127.0.0.1:41675/api/config); [request] Failed to load resource: the server responded with a status of 405 (Method Not Allowed) (http://127.0.0.1:41675/api/config)
- 2026-11-10T02:04:55Z · message_queued at 2026-11-10T02:04:55.465Z
- 2026-11-10T02:04:55Z · handoff failed · task-file handoff failed at verify · ui verification failed (2 issue(s)): [request] HTTP 405 for http://127.0.0.1:41675/api/config (http://127.0.0.1:41675/api/config); [request] Failed to load resource: the server responded with a status of 405 (Method Not Allowed) (http://127.0.0.1:41675/api/config)
- 2026-11-10T02:05:16Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-10T02:22:32Z · body
- 2026-11-10T02:39:46Z · handoff_deferred: 3 queued message(s) must be read before review
- 2026-11-10T02:39:46Z · message_overdue: still queued after 60m without being delivered
- 2026-11-10T02:39:47Z · message_queued at 2026-11-10T02:39:47.277Z
- 2026-11-10T02:39:48Z · ↻ resuming engineer to read queued message
- 2026-11-10T02:39:48Z · agent exited with an error (cursor) · RetriableError: Connection failed repeatedly
- 2026-11-10T02:39:48Z · engineer crash recovery: resuming cursor + composer-2.5 (1/3 crashes in 30m) · RetriableError: Connection failed repeatedly
- 2026-11-10T02:39:54Z · engineer crash recovery: start failed — task is already running or finalizing
- 2026-11-10T03:27:47Z · needs_input
- 2026-11-10T03:27:49Z · message_delivered: 4 message(s)
- 2026-11-10T03:28:09Z · agent exited with an error (cursor) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-10T03:28:39Z · engineer crash recovery: resuming cursor + composer-2.5 (1/12 crashes in 30m) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-10T04:18:16Z · needs_input
- 2026-11-10T04:24:32Z · note: adopted orphaned engineer pid 29278
- 2026-11-10T04:31:25Z · body
- 2026-11-10T04:32:02Z · body
- 2026-11-10T04:44:30Z · message_queued at 2026-11-10T04:44:30.301Z
- 2026-11-10T04:44:30Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-10T04:49:31Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-10T04:54:30Z · watchdog: check wait escalated · waiting: waiting for serialized local fallback (1 ahead, position 2); slot holder 60421 is dead for 11m · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-10T04:54:40Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-10T04:56:16Z · note: adopted orphaned engineer pid 29278
- 2026-11-10T05:01:16Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-10T05:46:05Z · queued message undelivered for 62m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-10T05:46:15Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: Re-running the scoped check after a flaky unrelated test failure. · stderr: RetriableError: Connection failed repeatedly Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-10T05:46:24Z · message_overdue: still queued after 60m without being delivered
- 2026-11-10T06:16:18Z · watchdog: check wait escalated · waiting: waiting for serialized local fallback (1 ahead, position 2); wait exceeds the handoff deadline for 30m · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-10T06:26:15Z · needs_input
- 2026-11-10T06:26:16Z · message_delivered: 1 message(s)
- 2026-11-10T06:26:19Z · watchdog: check wait escalated · waiting: waiting for serialized local fallback (1 ahead, position 2); wait exceeds the handoff deadline for 40m · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-10T06:27:10Z · message_queued at 2026-11-10T06:27:10.827Z
- 2026-11-10T06:27:11Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-10T06:30:59Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-10T06:33:17Z · engineer crash recovery: resuming cursor + composer-2.5 (1/3 crashes in 30m) · RetriableError: Agent turn stopped after repeated resume attempts made no progress
- 2026-11-10T06:33:21Z · needs_input
- 2026-11-10T06:33:21Z · message_delivered: 1 message(s)
- 2026-11-10T06:33:22Z · watchdog: check wait escalated · waiting: waiting for serialized local fallback (1 ahead, position 2); wait exceeds the handoff deadline for 47m · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-10T06:49:28Z · body
- 2026-11-10T06:49:40Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-10T07:02:01Z · body
- 2026-11-10T07:04:52Z · body
- 2026-11-10T07:05:06Z · body
- 2026-11-10T07:06:15Z · CTO nudge: held — handoff gate is running
- 2026-11-10T07:08:04Z · body
- 2026-11-10T07:16:15Z · note: ui verification passed: 3 of 3 shots captured with clean console (1 shot warning)
- 2026-11-10T07:16:20Z · status active→review
- 2026-11-10T07:16:21Z · message_queued at 2026-11-10T07:16:21.010Z
- 2026-11-10T07:22:32Z · note: review pass 1: needs some work
- 2026-11-10T07:22:33Z · message_delivered: 1 message(s)
- 2026-11-10T07:22:33Z · status review→active
- 2026-11-10T07:36:16Z · message_queued at 2026-11-10T07:36:16.734Z
- 2026-11-10T07:36:17Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-10T07:41:16Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-10T08:09:19Z · note: adopted orphaned engineer pid 72287
- 2026-11-10T08:14:22Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-10T08:36:24Z · queued message undelivered for 60m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-10T08:36:39Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: Implementing the three review fixes. · stderr: (empty)
- 2026-11-10T08:36:39Z · status active→review
- 2026-11-10T08:36:39Z · message_delivered: 1 message(s)
- 2026-11-10T08:36:40Z · note: handoff requested (cli)
- 2026-11-10T08:39:22Z · CTO nudge: held — handoff gate is running
- 2026-11-10T08:50:22Z · message_queued at 2026-11-10T08:50:22.678Z
- 2026-11-10T08:50:23Z · handoff failed · task-file handoff failed at check · remote validation failed: test failure: gate exit 1 on bee — fix it in the feature branch and re-run the gate
- 2026-11-10T08:54:22Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-10T09:27:14Z · body
- 2026-11-10T09:34:59Z · body
- 2026-11-10T09:50:34Z · queued message undelivered for 60m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-10T09:50:34Z · status active→review
- 2026-11-10T09:50:35Z · message_delivered: 1 message(s)
- 2026-11-10T09:50:35Z · note: handoff requested (cli)
- 2026-11-10T09:54:23Z · CTO nudge: held — handoff gate is running
- 2026-11-10T10:01:34Z · message_queued at 2026-11-10T10:01:34.779Z
- 2026-11-10T10:01:34Z · handoff failed · task-file handoff failed at check · repoos check failed: check-fmt:check — Formatting failed — run `bun run fmt` to fix:
- 2026-11-10T10:04:22Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-10T10:21:40Z · body
- 2026-11-10T10:26:07Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-10T10:26:08Z · message_queued at 2026-11-10T10:26:08.027Z
- 2026-11-10T10:26:08Z · ↻ resuming engineer to read queued message
- 2026-11-10T10:26:08Z · status active→review
- 2026-11-10T10:26:08Z · message_delivered: 2 message(s)
- 2026-11-10T10:26:09Z · note: handoff requested (cli)
- 2026-11-10T10:29:22Z · CTO nudge: held — handoff gate is running
- 2026-11-10T10:32:26Z · note: ui verification failed: ui verification failed (20 issue(s)): [request] HTTP 404 for http://127.0.0.1:46173/api/tasks/pipe-review/landable (http://127.0.0.1:46173/api/tasks/pipe-review/landable); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:46173/api/tasks/pipe-review/landable); [request] HTTP 404 for http://127.0.0.1:46173/api/tasks/pipe-closeout/landable (http://127.0.0.1:46173/api/tasks/pipe-closeout/landable); [request] Failed to
- 2026-11-10T10:32:26Z · message_queued at 2026-11-10T10:32:26.945Z
- 2026-11-10T10:32:27Z · handoff failed · task-file handoff failed at verify · ui verification failed (20 issue(s)): [request] HTTP 404 for http://127.0.0.1:46173/api/tasks/pipe-review/landable (http://127.0.0.1:46173/api/tasks/pipe-review/landable); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:46173/api/tasks/pipe-review/landable); [request] HTTP 404 for http://127.0.0.1:46173/api/tasks/pipe-closeout/landable (http://127.0.0.1:46173/api/tasks/pipe-closeout/landable); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:46173/api/tasks/pipe-closeout/landable); [request] HTTP 404 for http://127.0.0.1:46173/api/tasks/pipe-stuck/handoff-status (http://127.0.0.1:46173/api/tasks/pipe-stuck/handoff-status); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:46173/api/tasks/pipe-stuck/handoff-status); [request] HTTP 404 for http://127.0.0.1:46173/api/tasks/pipe-held/handoff-status (http://127.0.0.1:46173/api/tasks/pipe-held/handoff-status); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:46173/api/tasks/pipe-held/handoff-status); [request] HTTP 404 for http://127.0.0.1:46173/api/tasks/pipe-sentback/handoff-status (http://127.0.0.1:46173/api/tasks/pipe-sentback/handoff-status); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:46173/api/tasks/pipe-sentback/handoff-status); [request] HTTP 404 for http://127.0.0.1:46173/api/tasks/pipe-coding/handoff-status (http://127.0.0.1:46173/api/tasks/pipe-coding/handoff-status); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:46173/api/tasks/pipe-coding/handoff-status)
- 2026-11-10T10:34:22Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-10T10:47:04Z · body
- 2026-11-10T10:47:42Z · body
- 2026-11-10T10:54:22Z · CTO nudge: held — handoff gate is running
- 2026-11-10T11:01:09Z · note: adopted orphaned engineer pid 39097
- 2026-11-10T11:04:26Z · handoff failed · remote validation failed: test failure: gate exit 2 on thinkpad — fix it in the feature branch and re-run the gate
- 2026-11-10T11:04:27Z · message_queued at 2026-11-10T11:04:27.572Z
- 2026-11-10T11:04:27Z · handoff failed · handoff recovery attempted · finalization failed
- 2026-11-10T11:06:08Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-10T11:17:56Z · body
- 2026-11-10T11:32:30Z · queued message undelivered for 60m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-10T11:32:45Z · handoff_deferred: 2 queued message(s) must be read before review
- 2026-11-10T11:32:45Z · message_overdue: still queued after 60m without being delivered
- 2026-11-10T11:32:46Z · message_queued at 2026-11-10T11:32:46.103Z
- 2026-11-10T11:32:46Z · ↻ resuming engineer to read queued message
- 2026-11-10T11:32:46Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: no assistant message · stderr: (empty)
- 2026-11-10T11:32:47Z · status active→review
- 2026-11-10T11:32:47Z · message_delivered: 3 message(s)
- 2026-11-10T11:32:48Z · note: handoff requested (cli)
- 2026-11-10T11:33:50Z · message_queued at 2026-11-10T11:33:50.813Z
- 2026-11-10T11:33:51Z · handoff failed · task-file handoff failed at check · repoos check failed: check-fmt:check — Formatting failed — run `bun run fmt` to fix:
- 2026-11-10T11:55:03Z · body
- 2026-11-10T12:15:10Z · body
- 2026-11-10T12:33:20Z · body
- 2026-11-10T12:35:35Z · queued message undelivered for 62m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-10T12:35:36Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-10T12:35:36Z · message_overdue: still queued after 60m without being delivered
- 2026-11-10T12:35:36Z · message_queued at 2026-11-10T12:35:36.561Z
