---
id: "1084"
title: "Easter eggs bundle: task drawer status cards (one at a time, spacing, stray info icon)"
type: feature
status: active
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/easter-eggs-bundle-task-drawer-status-ca
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-10T04:51:24Z"
updated_at: "2026-11-13T15:28:57Z"
last_check_failure: "repoos check at 2026-11-13T15:23:12.527Z: repoos check failed: ui verification failed (1 issue(s)): [missing-target] Drawer close-out failure in light appearance (target \"default\"): highlight .drawer-done-error matched nothing on /work?task=1084&tab=changes (http://127.0.0.1:38527/work?shotState=drawer:statusChecksFailed)"
---
## Problem
The task drawer (screenshot, #1070 after a failed Move to done) stacks a red close-out failure card on top of a yellow "Waiting for you" review card. Several things are wrong:

1. **Two status cards at once.** We agreed on ONE status card at a time in the drawer. Pick the most actionable (a fresh close-out failure outranks a stale review-needs-work state) and show only that; fold the other into a collapsed "Also" line or the Details view.
2. **Stale/contradictory content.** The yellow card still says the reviewer sent it back 2 times and quotes a finding about the shell fade, while the red card says close-out failed on a test. The user cannot tell which is current or what to do next.
3. **Stray info (i) icon with a barely visible popup.** The popup repeats the card text ("The build or check gate failed on the merged branch...") and overlaps the check output text, nearly invisible. Remove the duplicate popover (or make it a real, readable popover only if it adds information); no native tooltip.
4. **Spacing.** The red card has no side padding relative to the drawer content and no gap between it and the yellow card below. Use the shared card spacing so edges and vertical gaps line up with the rest of the drawer.
5. Wording: avoid jargon ("gate", "merged branch") in the card text; say what failed and the single next action.

## Acceptance
- Only one status card renders at a time, with a deterministic priority order and a test.
- No duplicate info popover; check output stays readable.
- Consistent horizontal padding and vertical gaps; screenshot of the failed close-out state in light and dark.

## Notes for AI
Find the drawer cards in src/ui-app (task drawer status/close-out failure and review "waiting for you" components). Easter egg bundle: keep it to this card cleanup. Do not edit repoos.toml.

## Also fix: elapsed time differs between task card and drawer
On #1086 the board and pipeline cards showed 'Checks · checking review · 9m 46s' while the open drawer showed 'Running checks · 2m 46s' for the same handoff. Both subtract the same status.startedAt, but from different clocks: TaskCard.vue (cardChecksDisplay, ~line 96) uses the shared once-a-second useNow clock, while TaskDrawer.vue (drawerChecksDisplay, ~line 462) uses its own checkNow ref, which only ticks while a check-run loop is active (and the drawer's progress line read 'starting...' while the handoff step was 'review'). Make the drawer use the same live clock (useNow) so both always agree, and show the same step wording (the drawer should say what the card says, e.g. 'checking review'). Add a test that renders both with one status and asserts the same elapsed string.

## Shots
```json
[
{
"label": "Drawer close-out failure",
"target": "default",
"route": "/work?task=9999&tab=changes",
"highlight": ".drawer-done-error",
"state": "card:doneError"
}
]
```

## Screenshots

![32](/api/tasks/1084/attachments/att_bf168d02-53c0-4a61-9f11-e304e50cca7e.webp)
![Card 9m 46s](/api/tasks/1084/attachments/att_1129551f-d173-488c-9279-cef590bb105a.png)
![Drawer 2m 46s](/api/tasks/1084/attachments/att_a40476b9-e8e5-4d5b-88de-567d8eca5e79.png)

## Activity

- 2026-11-10T04:51:24Z · created · njachowski@gmail.com
- 2026-11-10T04:51:25Z · screenshots
- 2026-11-10T04:51:27Z · needs_input
- 2026-11-11T03:12:51Z · body: Also fix: elapsed time differs between task card and drawer (added)
- 2026-11-11T03:12:51Z · screenshots
- 2026-11-13T14:29:59Z · cli_override, model_override
- 2026-11-13T14:30:02Z · status inbox→ready
- 2026-11-13T14:30:03Z · status ready→active, needs_input, branch
- 2026-11-13T14:33:47Z · body
- 2026-11-13T14:42:44Z · body
- 2026-11-13T15:13:19Z · message_queued at 2026-11-13T15:13:19.507Z
- 2026-11-13T15:13:19Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-13T15:13:27Z · body
- 2026-11-13T15:13:28Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-13T15:18:06Z · body
- 2026-11-13T15:23:09Z · note: ui verification failed: ui verification failed (1 issue(s)): [missing-target] Drawer close-out failure in light appearance (target "default"): highlight .drawer-done-error matched nothing on /work?task=1084&tab=changes (http://127.0.0.1:38527/work?shotState=drawer:statusChecksFailed)
- 2026-11-13T15:23:09Z · message_queued at 2026-11-13T15:23:09.351Z
- 2026-11-13T15:23:12Z · message_delivered: 1 message(s)
- 2026-11-13T15:23:50Z · body
- 2026-11-13T15:26:30Z · body
- 2026-11-13T15:28:28Z · CTO nudge: held — handoff gate is running
- 2026-11-13T15:28:57Z · note: ui verification passed: 1 of 1 shot captured with clean console
