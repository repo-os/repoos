---
id: "1147"
title: "Mobile task detail: make tabs and preview guidance reachable"
type: bug
status: done
priority: p1
area: web
merged_commit: a9b658ac5e3f62f81ddc8e97942468e1d42d1c3a
assigned_to: ai
created_by: t@t
branch: feat/mobile-task-detail-make-tabs-and-preview
created_at: "2026-11-17T03:06:27Z"
updated_at: "2026-11-17T07:14:37Z"
last_close_out_gate_ms: 212267
last_close_out_gate_at: "2026-11-17T07:14:11.737Z"
review_passes: 1
last_check_failure: "repoos check at 2026-11-17T05:37:46.311Z: repoos check failed: ui verification failed (1 issue(s)): [missing-target] Phone task detail at 320px: all tabs and the expand control on screen (target \"default\"): loading state detected: loading text \"Loading full diff… this may take a momen\" on /work?task=9999&tab=changes (http://127.0.0.1:43923/work?task=9999&tab=changes&shotState=drawer%3AreviewWithBranch)"
---
## Problem
At 390×844, the mobile task detail tab strip continues beyond the viewport and the preview-target helper wraps one or two words per line beside its selector. The cramped title/header alignment and Mission Control heading alignment are owned by #1145 and are excluded from this follow-up.

## Desired UX
Task detail tabs and preview-target guidance remain readable and reachable on narrow phones.

## Acceptance criteria
- At 390px and 320px, all task detail tabs are reachable without accidental clipping.
- Preview helper copy wraps at a readable line length or is removed when redundant.
- The header title, close control and title alignment remain within #1145 scope.
- Desktop behavior is preserved.

## Notes for AI
Use the attached 390×844 screenshot. Inspect both themes and a long task title. Do not change the title/header or Mission Control alignment covered by #1145.

## Shots
```json
[
{
"label": "Phone task detail at 390px: preview guidance gets its own readable line",
"target": "default",
"route": "/work?task=9999&tab=details",
"highlight": ".quickbar-row > .preview-hint",
"steps": [
{
"waitFor": ".drawer-tabs"
},
{
"waitFor": ".quickbar-row > .preview-hint"
},
{
"waitMs": 300
}
],
"state": "drawer:reviewWithBranch",
"theme": "dark",
"viewportWidth": 390,
"viewportHeight": 844
},
{
"label": "Phone task detail at 320px: all tabs and the expand control on screen",
"target": "default",
"route": "/work?task=9999&tab=details",
"highlight": ".drawer-tabs",
"steps": [
{
"waitFor": ".drawer-tabs"
},
{
"waitMs": 300
}
],
"state": "drawer:reviewWithBranch",
"theme": "light",
"viewportWidth": 320,
"viewportHeight": 844
}
]
```

## Screenshots

![Task detail at 390×844: compressed header, clipped tabs and narrow preview helper](/api/tasks/1147/attachments/att_e9641dca-402a-4402-8579-dbbac305c980.png)

## Activity

- 2026-11-17T03:06:27Z · created · t@t
- 2026-11-17T03:06:29Z · screenshots
- 2026-11-17T03:06:30Z · needs_input
- 2026-11-17T03:07:47Z · body: Problem (added); Desired UX (added); Acceptance criteria (added); Notes for AI (added)
- 2026-11-17T03:32:32Z · body: Problem (added 1, removed 1); Desired UX (added 1, removed 1); Acceptance criteria (added 3, removed 3); Notes for AI (added 1, removed 1)
- 2026-11-17T03:32:42Z · title
- 2026-11-17T05:14:03Z · needs_input
- 2026-11-17T05:14:11Z · status inbox→ready
- 2026-11-17T05:14:16Z · status ready→active, branch
- 2026-11-17T05:25:17Z · body
- 2026-11-17T05:31:58Z · body
- 2026-11-17T05:34:57Z · CTO nudge: held — handoff gate is running
- 2026-11-17T05:37:43Z · note: ui verification failed: ui verification failed (1 issue(s)): [missing-target] Phone task detail at 320px: all tabs and the expand control on screen (target "default"): loading state detected: loading text "Loading full diff… this may take a momen" on /work?task=9999&tab=changes (http://127.0.0.1:43923/work?task=9999&tab=changes&shotState=drawer%3AreviewWithBranch)
- 2026-11-17T05:37:43Z · message_queued at 2026-11-17T05:37:43.252Z
- 2026-11-17T05:37:46Z · message_delivered: 1 message(s)
- 2026-11-17T05:37:54Z · body
- 2026-11-17T05:41:39Z · body
- 2026-11-17T05:46:25Z · body
- 2026-11-17T05:49:34Z · note: ui verification passed: 2 of 2 shots captured with clean console
- 2026-11-17T05:49:35Z · status active→review
- 2026-11-17T05:49:35Z · message_queued at 2026-11-17T05:49:35.632Z
- 2026-11-17T05:53:21Z · note: review pass 1: good to go
- 2026-11-17T06:52:21Z · message_overdue: still queued after 60m without being delivered
- 2026-11-17T07:14:11Z · close-out gate completed in 212s
- 2026-11-17T07:14:37Z · status done→done, release:success
