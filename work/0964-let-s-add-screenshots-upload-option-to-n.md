---
id: "0964"
title: Add screenshot upload to New Story
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/add-screenshot-upload-to-new-story
pm_cli_override: cursor
pm_model_override: grok-4.7-low
created_at: "2026-10-26T19:47:15Z"
updated_at: "2026-10-31T01:17:01Z"
---
## Problem

The New Task panel lets you attach screenshots while creating a task. The New Story panel does not. Stories sometimes need screenshots too, and there is no way to add them at creation time.

## Desired UX

New Story offers the same screenshot upload as New Task. You can add one or more screenshots in the panel before saving the story, and those screenshots are stored with the story you just created.

## Acceptance criteria

- [ ] The New Story panel includes a screenshot upload control that works the same way as the one on New Task (pick files and drop images on the panel).
- [ ] Accepted formats and the in-panel preview match New Task.
- [ ] Screenshots chosen before save are attached to the story when it is created.
- [ ] After creation, those screenshots are visible on the story the same way task screenshots are visible on a task.
- [ ] Creating a story with no screenshots still works as it does today.
- [ ] A failed upload is reported in the panel and can be retried, matching New Task.

## Notes for AI

- Match the existing New Task screenshot picker. Do not design a different control.
- UI lives in `src/ui-app/src/components/NewStoryPanel.vue`. The New Task picker is in `src/ui-app/src/components/TaskDrawer.vue`. Story PM chat (`StoryPmChat.vue`) already accepts screenshots after a story exists; leave that flow as it is and add upload on the creation panel.
- Reuse the shared dropzone styles (`shot-dropzone` and related `ff-*` classes in `src/ui-app/src/style.css`). Do not add a native file-dialog replacement or a new visual style.
- Store pixels under the gitignored attachments tree and record them on the story markdown through the existing RepoOS attachment path. Do not commit image files.
- Assumption: "similar to New Task" means create-time attach (picker, preview, upload on save, retry on failure), not a change to later editing or to PM chat.

## Scope

Covers screenshot upload on the New Story creation panel only. Does not change New Task, story PM chat, or how screenshots are added after a story already exists.

## Original prompt

Let's add screenshots upload option to "New Story" similar to how we have it on the "New Task" panel, because stories sometimes have screenshots as well.

## Screenshots

![Screenshot-2026-10-27-at-02.44.47](/api/tasks/0964/attachments/att_b18d1156-5238-4f43-a252-50d3eeb9115f.png)
![Screenshot-2026-10-27-at-02.45.59](/api/tasks/0964/attachments/att_e26f6cd1-0434-4a70-8ac4-5240b2cab068.png)

## Shots
```json
[
{
"label": "New story screenshot picker",
"target": "default",
"route": "/stories",
"highlight": ".shot-dropzone",
"steps": [
{
"click": "button.new-btn"
},
{
"waitMs": 300
}
]
}
]
```

## Activity

- 2026-10-26T19:47:15Z · created · hello@repoos.org
- 2026-10-26T19:47:48Z · screenshots
- 2026-10-26T19:47:49Z · screenshots
- 2026-10-26T19:48:27Z · status draft→inbox, title, area, body: Problem (added); Desired UX (added); Acceptance criteria (added); Notes for AI (added); Scope (added)
- 2026-10-30T15:21:06Z · status inbox→ready
- 2026-10-30T15:21:11Z · status ready→active, branch
- 2026-10-30T15:26:26Z · watchdog: auto-surfaced stuck task · status active→ready · agent never started — no session exists for this task · next step: resume the session manually from the task's worktree and check for uncommitted work
- 2026-10-31T00:43:22Z · status ready→active
- 2026-10-31T00:48:36Z · body
- 2026-10-31T00:50:07Z · body
- 2026-10-31T00:54:16Z · note: adopted orphaned engineer pid 76136
- 2026-10-31T00:59:11Z · note: adopted orphaned engineer pid 76136
- 2026-10-31T01:15:44Z · status active→review
- 2026-10-31T01:15:45Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (6b826c467) during finalization (#0734)
- 2026-10-31T01:17:01Z · note: review pass 1: needs some work
