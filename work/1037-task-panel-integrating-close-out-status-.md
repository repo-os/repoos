---
id: 1037
title: "Task panel: integrating/close-out status belongs in the info card above the tabs, not as a variable-width button in the action row"
type: bug
status: done
priority: p2
area: web
merged_commit: 9f2ba1b992727f45f89009c57bde3d2c01d4ccff
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/task-panel-integrating-close-out-status-
cli_override: cursor
model_override: grok-4.7-low
created_at: "2026-11-04T18:25:01Z"
updated_at: "2026-11-04T21:50:44Z"
last_close_out_gate_ms: 178459
last_close_out_gate_at: "2026-11-04T21:50:44.213Z"
review_passes: 1
---
## Problem

While a task is closing out (Move to done), the task panel shows `integrating · building candidate · 1m 01s` / `integrating · remote tests · 7m 41s` as a variable-length, button-shaped, non-clickable element in the same row as real buttons (Review state dropdown, D8 · R3 chip, Stop work, Stop MTD). Because its text length changes, it pushes Stop MTD onto a second row and shoves the preview row down. It looks like a button but does nothing, so it reads as broken. See the two screenshots: #1035 (correct) vs #1034 (bug).

This was already asked for in #0952 (all status content between the preview line and the tabs, one card plus one status line) and is still not true for the integration status.

## Desired UX

1. The integration / close-out progress text (`integrating · <step> · <elapsed>`) is NOT rendered in the action-button row. That row contains only real, clickable controls: state dropdown, D/R chip, Pause/Stop work, Stop MTD.
2. The integration status renders in the info-card slot: its own full-width line directly below the preview-target row and directly above the tabs, styled like the `coding · active 3m ago` status card on an active task (#1035 screenshot).
3. It obeys the #0952 rule: at most one card plus one status line there, chosen by the existing priority function. Integration progress is the status line; if a higher-priority card exists, fold it in rather than adding a second element.
4. The action row keeps a stable layout while the status text changes length: Stop MTD stays on the same row as Stop work at normal panel widths. Verify at normal and narrow widths.
5. Nothing that is not clickable may look like a button (no button border, fill, or radius on status text).

## Acceptance criteria

- [ ] While close-out runs, the action row contains no integration status text, and its layout does not change as the step name or timer changes.
- [ ] The integration step and elapsed time appear as one full-width status line between the preview row and the tabs.
- [ ] The status line is not styled as a button; it matches the existing info-card / status-line style in all themes (contrast audit and hard-coded-color guard pass).
- [ ] The #0952 priority function still yields at most one card plus one status line; extend its unit test with a close-out-in-progress case.
- [ ] Declare `## Shots` for the drawer during close-out (steps: building candidate, remote tests) at a normal and a narrow panel width, using a `state` fixture.
- [ ] Update affected tests and user-docs.

## Notes for AI

Look at where the drawer header renders the integration pill/status (grep TaskDrawer.vue for the integrating label and the Stop MTD button) and at the status-line component used for `coding · active …`. Reuse them; do not add bespoke styles (AGENTS.md: shared dialog and form classes, aligned layouts). Related: #0952 (one card + one status line above the tabs), #0922, #0995 (card integrating text).

## Shots
```json
[
{
"label": "Close-out building candidate on the status line",
"target": "default",
"route": "/work?task=9999",
"highlight": ".drawer-status-summary",
"state": "drawer:closeOutBuilding"
},
{
"label": "Close-out building candidate at a narrow panel width",
"target": "default",
"route": "/work?task=9999",
"highlight": ".drawer-status-summary",
"state": "drawer:closeOutBuildingNarrow"
},
{
"label": "Close-out remote tests on the status line",
"target": "default",
"route": "/work?task=9999",
"highlight": ".drawer-status-summary",
"state": "drawer:closeOutRemoteTests"
},
{
"label": "Close-out remote tests at a narrow panel width",
"target": "default",
"route": "/work?task=9999",
"highlight": ".drawer-status-summary",
"state": "drawer:closeOutRemoteTestsNarrow"
}
]
```

## Screenshots

![Correct: #1035 'coding · active 3m ago' status is its own full-width info card directly above the tabs](/api/tasks/1037/attachments/att_60b8edd5-80a0-4ef7-9311-ead64b507da4.png)
![Bug: #1034 'integrating · remote tests · 7m 41s' is a long inert, button-looking element squashed into the action-button row (Stop work, Stop MTD)](/api/tasks/1037/attachments/att_bfa59839-9f9f-4280-bc66-89823f97dabe.png)

## Activity

- 2026-11-04T18:25:01Z · created · njachowski@gmail.com
- 2026-11-04T18:25:01Z · screenshots
- 2026-11-04T20:34:53Z · status inbox→ready
- 2026-11-04T20:35:03Z · cli_override
- 2026-11-04T20:35:04Z · model_override
- 2026-11-04T20:45:23Z · status ready→active, branch
- 2026-11-04T20:51:43Z · body
- 2026-11-04T20:51:44Z · note: adopted orphaned engineer pid 13630
- 2026-11-04T21:00:07Z · note: adopted orphaned engineer pid 13630
- 2026-11-04T21:02:31Z · body
- 2026-11-04T21:10:05Z · CTO nudge: held — handoff gate is running
- 2026-11-04T21:32:39Z · status active→review
- 2026-11-04T21:32:39Z · message_queued at 2026-11-04T21:32:39.920Z
- 2026-11-04T21:33:37Z · note: review pass 1: good to go
- 2026-11-04T21:48:37Z · note: shots: skipped — 4 handoff shots already captured for this exact plan (9f2ba1b99) during finalization (#0734)
- 2026-11-04T21:50:44Z · close-out gate completed in 178s

