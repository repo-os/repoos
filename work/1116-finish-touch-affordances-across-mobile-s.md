---
id: "1116"
title: Finish touch affordances across mobile surfaces
type: feature
status: review
priority: p1
area: web
depends_on: ["1112", "1114", "1115"]
assigned_to: ai
created_by: t@t
branch: feat/finish-touch-affordances-across-mobile-s
cli_override: cursor
model_override: composer-2.5
created_at: "2026-11-14T09:11:01Z"
updated_at: "2026-11-14T18:31:00Z"
check_retry_count: 1
last_check_failure: "repoos check at 2026-11-14T18:05:30.510Z: repoos check failed: ui verification failed: timed out waiting for the task's browser capture"
review_passes: 2
review_rounds: 1
dev_error_count: 5
---
## Problem
Some existing surfaces still depend on hover or small pointer controls. The last-activity popover work in #1069 is complete, but its behavior needs to be included in the narrow-screen experience.

## Desired UX
Users can discover and operate important actions on touch across Work, task details, Settings, Releases and Activity.

## Acceptance criteria
- Audit affected screens below 720 px for hover-only actions, targets below 44 CSS px where practical, and horizontal overflow; fix remaining issues within scope.
- Preserve desktop interaction and avoid changing unrelated tooltip hosts globally.
- Ensure completed #1069 last-activity trigger works on touch in the mobile composition; retain scoped gesture behavior and pointercancel safety.
- Make Releases and Activity readable and actions discoverable on narrow screens, including configured and empty states.
- Add focused coverage for touch activation, pointer cancellation, overflow and action visibility.
- Follow shared overlay/dialog and keyboard accessibility conventions.
## Notes for AI
Read ADR 0011. #1069 is already complete and should not be reopened by default; verify its scoped interaction and integrate only if the new mobile compositions require adaptation. Keep this task to cross-surface touch fixes after the shell, detail and Settings slices.

## Floating heads on narrow screens (added by Nick)
On screens below 720px the floating heads (Ross, CTO, Debugger) must not reserve their own column. Today `.main` in src/ui-app/src/style.css (narrow block, about line 9534) sets `padding-inline-end: max(16px, var(--page-inline-end-inset))`, which takes about 70px (head size 46 + offset 12 + 12) off an already narrow content width, and `.ibar-wrap` in IntegrationStatusBar.vue (narrow block, about line 1187) offsets `right: var(--page-inline-end-inset)` for the same reason. Required: (1) on narrow screens set the inline-end inset to 0 so content and the integration bar use the full width, and let the heads float OVER the content (they are already position: fixed at the bottom right above the tab bar); (2) keep bottom clearance so the last row is never hidden under the stack, using the existing --page-bottom-inset; (3) add a per-device preference, default OFF on narrow screens and ON on desktop, to show or hide the floating heads, as a control in Settings (shared components, no native select; stored per device in local storage, not repoos.toml); when hidden, the CTO/Ross/Debugger remain reachable from the More sheet; (4) tests for the inset on narrow and wide screens, the preference, and no horizontal overflow; (5) phone-width (viewportWidth 390) shots with heads shown and hidden.

## Shots
```json
[
{
"label": "Phone More sheet with agent actions when heads are hidden",
"target": "default",
"route": "/work",
"highlight": ".mobile-more-sheet",
"steps": [
{
  "click": ".tab[aria-haspopup=\"dialog\"]"
}
],
"viewportWidth": 390
},
{
"label": "Phone Settings with floating heads preference",
"target": "default",
"route": "/settings?tab=general&section=themes",
"highlight": "[data-test-id=\"floating-heads-setting\"]",
"viewportWidth": 390
},
{
"label": "Phone CTO from More replaces open task detail",
"target": "default",
"route": "/work?task=9999",
"highlight": ".floating-head-panel",
"steps": [
{
  "waitFor": "[data-testid=\"mobile-task-detail\"]"
},
{
  "click": ".tab[aria-haspopup=\"dialog\"]"
},
{
  "waitFor": "[data-test-id=\"mobile-more-open-cto\"]"
},
{
  "click": "[data-test-id=\"mobile-more-open-cto\"]"
},
{
  "waitFor": ".floating-head-panel"
}
],
"state": "drawer:landableNarrow",
"viewportWidth": 390
},
{
"label": "Phone Work with floating agent buttons enabled",
"target": "default",
"route": "/work",
"highlight": ".floating-heads .stack",
"steps": [
{
  "click": ".tabbar a.tab[href=\"/settings\"]"
},
{
  "waitFor": "[data-test-id=\"floating-heads-setting\"]"
},
{
  "click": "[data-test-id=\"floating-heads-setting\"] [aria-label=\"Show floating agent buttons\"]"
},
{
  "click": ".tabbar a.tab[href=\"/work\"]"
},
{
  "waitFor": ".floating-heads .stack"
}
],
"viewportWidth": 390
}
]
```

## Activity

- 2026-11-14T09:11:01Z · created · t@t
- 2026-11-14T09:11:02Z · needs_input
- 2026-11-14T09:11:47Z · depends_on, body: Desired UX (added); Acceptance criteria (added 5, removed 5); Notes for AI (added); Desired outcome (removed)
- 2026-11-14T09:22:40Z · needs_input
- 2026-11-14T16:03:44Z · cli_override, model_override
- 2026-11-14T16:03:46Z · status inbox→ready
- 2026-11-14T16:12:46Z · body: Floating heads on narrow screens (added by Nick) (added)
- 2026-11-14T16:14:12Z · status ready→active, branch
- 2026-11-14T16:17:56Z · body
- 2026-11-14T16:18:09Z · body
- 2026-11-14T16:21:39Z · body
- 2026-11-14T16:22:17Z · note: adopted orphaned engineer pid 34168
- 2026-11-14T16:23:36Z · body
- 2026-11-14T16:23:54Z · note: adopted orphaned engineer pid 34168
- 2026-11-14T16:26:55Z · body
- 2026-11-14T16:27:54Z · body
- 2026-11-14T16:28:52Z · CTO nudge: held — handoff gate is running
- 2026-11-14T16:39:03Z · handoff failed · remote validation failed: test failure: tests/page-height-browser.test.ts > full-height page scrollports (WebKit) > keeps pipeline controls outside the head stack at 320px, tests/page-height-browser.test.ts > full-height page scrollports (WebKit) > keeps pipeline controls outside the head stack at 390px, tests/page-height-browser.test.ts > full-height page scrollports (WebKit) > keeps pipeline controls outside the head stack at 760px on bee — fix it in the feature branch and re-run the gate
- 2026-11-14T16:39:03Z · message_queued at 2026-11-14T16:39:03.715Z
- 2026-11-14T16:42:08Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-14T16:42:09Z · message_delivered: 1 message(s)
- 2026-11-14T16:44:09Z · body
- 2026-11-14T16:48:44Z · agent exited with an error (codex) · 2026-11-14T16:48:44.184052Z ERROR codex_core::session: failed to record rollout items: thread 01a1daf0-15e0-7cb1-894e-558d66c98cec not found
- 2026-11-14T16:48:44Z · engineer crash recovery: resuming codex + gpt-6-luna (1/3 crashes in 30m) · 2026-11-14T16:48:44.184052Z ERROR codex_core::session: failed to record rollout items: thread 01a1daf0-15e0-7cb1-894e-558d66c98cec not found
- 2026-11-14T16:48:45Z · needs_input
- 2026-11-14T16:48:47Z · agent exited with an error (codex) · Reading additional input from stdin...
- 2026-11-14T16:48:47Z · engineer crash recovery: resuming codex + gpt-6-luna (2/3 crashes in 30m) · Reading additional input from stdin...
- 2026-11-14T16:48:48Z · needs_input
- 2026-11-14T16:48:48Z · message_queued at 2026-11-14T16:48:48.789Z
- 2026-11-14T16:48:50Z · agent exited with an error (codex) · Reading additional input from stdin...
- 2026-11-14T16:48:50Z · engineer crash recovery: surfaced instead of switching — a human-set task override (codex + gpt-6-luna) is pinned, so RepoOS did not replace it (3/3 crashes in 30m)
- 2026-11-14T16:48:52Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-14T16:51:53Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-14T16:51:54Z · message_delivered: 1 message(s)
- 2026-11-14T16:51:57Z · agent exited with an error (codex) · Reading additional input from stdin...
- 2026-11-14T16:51:57Z · engineer crash recovery: surfaced instead of switching — a human-set task override (codex + gpt-6-luna) is pinned, so RepoOS did not replace it (4/3 crashes in 30m)
- 2026-11-14T17:02:08Z · watchdog: restarting engineer after 10m with no live process
- 2026-11-14T17:02:13Z · agent exited with an error (codex) · Reading additional input from stdin...
- 2026-11-14T17:02:13Z · engineer crash recovery: surfaced instead of switching — a human-set task override (codex + gpt-6-luna) is pinned, so RepoOS did not replace it (5/3 crashes in 30m)
- 2026-11-14T17:03:58Z · cli_override, model_override
- 2026-11-14T17:03:59Z · needs_input
- 2026-11-14T17:05:01Z · body
- 2026-11-14T17:05:15Z · body
- 2026-11-14T17:15:26Z · body
- 2026-11-14T17:21:21Z · body
- 2026-11-14T17:23:52Z · CTO nudge: held — handoff gate is running
- 2026-11-14T17:24:01Z · note: ui verification passed: 3 of 3 shots captured with clean console
- 2026-11-14T17:24:02Z · status active→review
- 2026-11-14T17:24:02Z · message_queued at 2026-11-14T17:24:02.187Z
- 2026-11-14T17:24:44Z · note: review pass 1: needs some work
- 2026-11-14T17:24:44Z · message_delivered: 1 message(s)
- 2026-11-14T17:24:45Z · status review→active
- 2026-11-14T17:24:47Z · CTO nudge: held — remote validation is running
- 2026-11-14T17:26:09Z · body
- 2026-11-14T17:35:28Z · message_queued at 2026-11-14T17:35:28.133Z
- 2026-11-14T17:35:28Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-14T17:38:38Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-14T17:38:52Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-14T17:42:39Z · message_delivered: 1 message(s)
- 2026-11-14T18:02:12Z · body
- 2026-11-14T18:02:52Z · status active→review
- 2026-11-14T18:05:27Z · note: shots: failed — browser capture cancelled
- 2026-11-14T18:05:27Z · message_queued at 2026-11-14T18:05:27.491Z
- 2026-11-14T18:05:28Z · note: review pass 2: good to go
- 2026-11-14T18:10:54Z · message_delivered: 1 message(s)
- 2026-11-14T18:11:57Z · body
- 2026-11-14T18:30:31Z · body
- 2026-11-14T18:31:00Z · message_queued at 2026-11-14T18:31:00.937Z
