---
id: "1282"
title: "Task drawer: collapse the Depends on, type, priority, area and story block into a one or two line summary that opens a modal"
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/task-drawer-collapse-the-depends-on-type
cli_override: claude code
model_override: haiku
created_at: "2026-11-22T03:22:33Z"
updated_at: "2026-11-22T15:33:54Z"
---
## Problem
The metadata block at the top of the task drawer (Depends on picker with a long task list, Type, Priority, Area, Story) takes a large amount of vertical space above the spec. A human rarely edits these, so most of the time it just pushes the content down.

## Desired UX
- By default the whole block is collapsed into one or two lines: a compact summary of the current values (for example 'feature · p3 · docs · no story · no dependencies'; list dependencies by id when there are any).
- Clicking the summary opens a modal (shared dialog components, not a bespoke overlay) with the full edit controls: Depends on picker, Type, Priority, Area, Story. Changes save the same way they do today.
- Selected dependencies appear as chips at the top of the picker so it is obvious what is set; show None when nothing is selected. The long candidate list stays inside the modal only.
- Works with keyboard and touch; the summary is a real button with a clear label.

## Acceptance criteria
- Drawer shows at most two lines for this section by default at 375, 768 and 1280 widths, with no overflow.
- The modal uses src/ui-app/src/components/ui/dialog/ shared dialogs and Teleport rules from AGENTS.md; existing edit behavior and API calls are unchanged.
- Headless fixtures cover collapsed summary, opening the modal, editing each field and saving.
- Existing tests that depend on the old inline layout are updated.

## Notes for AI
Start from TaskDrawer.vue and TaskDependencyPicker.vue. This is a requested redesign, so no extra new UI beyond what is described. Never touch repoos.toml. Headless Playwright only.

## Shots
```json
[
{
"label": "Task drawer Details tab with the collapsed metadata summary",
"target": "default",
"route": "/work?task=1282",
"highlight": "[data-test-id=\"task-meta-summary\"]"
},
{
"label": "Task details modal opened from the summary, with Depends on chips, Type, Priority, Area and Story",
"target": "default",
"route": "/work?task=1282",
"highlight": "[data-test-id=\"task-meta-modal\"]",
"steps": [
{
"click": "[data-test-id=\"task-meta-summary\"]"
},
{
"waitMs": 300
}
]
}
]
```

## Screenshots

![Task drawer metadata block (Depends on picker, Type, Priority, Area, Story) takes a large share of the drawer above the spec](/api/tasks/1282/attachments/att_46554cb3-68a8-462c-b896-acbc321292c0.png)

## Activity

- 2026-11-22T03:22:33Z · created · t@t
- 2026-11-22T03:22:34Z · screenshots
- 2026-11-22T03:22:43Z · status inbox→ready
- 2026-11-22T15:07:01Z · cli_override, model_override
- 2026-11-22T15:07:03Z · status ready→active, branch
- 2026-11-22T15:18:17Z · body
- 2026-11-22T15:26:03Z · body
- 2026-11-22T15:33:01Z · CTO nudge: held — handoff gate is running
- 2026-11-22T15:33:54Z · note: ui verification failed: ui verification failed (5 issue(s)): [request] HTTP 404 for http://127.0.0.1:45775/api/tasks/1282 (http://127.0.0.1:45775/api/tasks/1282); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:45775/api/tasks/1282); [missing-target] Task drawer Details tab with the collapsed metadata summary (target "default"): highlight [data-test-id="task-meta-summary"] matched nothing on /work?task=1282 (http://127.0.0.1:45775/work?t
