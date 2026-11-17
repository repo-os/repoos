---
id: "1146"
title: "Design audit: make all RepoOS pages work better on phones"
type: chore
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/design-audit-make-all-repoos-pages-work-
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-17T02:53:04Z"
updated_at: "2026-11-17T03:50:12Z"
last_check_failure: "repoos check at 2026-11-17T03:44:30.654Z: repoos check failed: reused check inputs changed during handoff — run the check again"
review_rounds: 1
review_passes: 1
---
## Problem
The phone experience across RepoOS pages needs a coherent design review: headings shift, unnecessary explanatory text consumes space, cards and controls feel dense, and some layers are difficult to read. The five attached screenshots show examples, including Mission Control, More, Stories, Work queue and task detail.

## Desired UX
A design-skilled agent systematically reviews the mobile web UI with a critical visual eye. Phone pages feel consistent, readable, touch-friendly and space-efficient, while keeping actions and important status discoverable.

## Acceptance criteria
- Survey every user-facing page and major mobile sheet, including Mission Control, Work, task detail, Search, More, Settings, Stories, Releases, Agents and relevant secondary screens at narrow phone widths; include long text, states, light and dark modes.
- Evaluate hierarchy, left alignment, spacing, truncation, touch targets, contrast, scrolling, overlays and information density; use rendered evidence and record route, viewport, issue severity and screenshots where appropriate.
- Produce a prioritized, actionable design report with concrete fixes and identify cross-page patterns. Create focused follow-up tasks through RepoOS for substantial findings, attach relevant screenshots using RepoOS, and avoid duplicating #1145.
- Implement only small cohesive fixes within the task if they do not overlap #1145; otherwise leave implementation to follow-up tasks. Preserve desktop behavior and existing design conventions.

## Notes for AI
Use strong visual and product design judgment. Inspect rendered pages and theme variants; do not infer a clean layout only from source. Coordinate with #1145 which owns the specific screenshot fixes, including More sheet contrast and idle pipeline. Do not request a managed preview unless the human requests one.

## Shots
```json
[
{
"label": "Search field meets the 44px phone touch target",
"target": "default",
"route": "/",
"highlight": ".search-overlay-input",
"steps": [
{
"click": "button.search-input"
},
{
"waitFor": ".search-overlay-input"
}
]
}
]
```

## Screenshots

![1000072370](/api/tasks/1146/attachments/att_445de410-5274-49a9-a8b3-e104081ad09f.png)
![1000072371](/api/tasks/1146/attachments/att_f0ebde0d-4ba3-45cd-b698-13658f0c8680.png)
![1000072372](/api/tasks/1146/attachments/att_d2862b9a-fdd6-49fa-956f-f719e8499dde.png)
![1000072373](/api/tasks/1146/attachments/att_9907d426-6620-4c35-89c1-a5ece676d8d8.png)
![1000072374](/api/tasks/1146/attachments/att_1210fbb9-6f97-459a-b173-a86ec4dd82a2.png)
![Mission Control light at 390×844](/api/tasks/1146/attachments/att_c86d65fc-dbee-4e0f-b33d-11ef27b6c373.png)
![Mission Control dark at 390×844](/api/tasks/1146/attachments/att_4886c697-7e10-4a40-b77a-87214da01776.png)
![Search overlay dark at 390×844; input verified 44px high](/api/tasks/1146/attachments/att_91b39c22-9ce0-4507-8b6f-abb238f8bf62.png)
![Login route at 390×844](/api/tasks/1146/attachments/att_47b0da96-5bb2-49fc-a122-0527f9c01b53.png)
![Task full-screen diff route at 390×844](/api/tasks/1146/attachments/att_70c63801-e82f-43d3-8177-b29236a23138.png)
![Repository working diff at 390×844; Back control measures 76×28px](/api/tasks/1146/attachments/att_be523a58-813a-4672-bd5b-600336d1c301.png)
![Commit diff route at 390×844](/api/tasks/1146/attachments/att_ad8c5752-83b7-4790-a754-6c41baa7caa2.png)
![Task detail at 390×844](/api/tasks/1146/attachments/att_3288185f-f19a-4c49-a9e4-cc1bfaa02ae5.png)
![Settings at 390×844](/api/tasks/1146/attachments/att_f71233b1-a5a3-42ee-93b8-6c567d554094.png)
![Checks at 390×844](/api/tasks/1146/attachments/att_e7d4d69a-496d-4efc-b2ae-4b78510123d2.png)
![Stories at 390×844](/api/tasks/1146/attachments/att_ca5230a8-67ed-4111-a63a-dc2b49211151.png)
![More sheet dark at 390×844](/api/tasks/1146/attachments/att_4d736d97-d652-4d02-923d-326a3c3e4822.png)
![Task conflict diff route at 390×844; Back control is 76×28px](/api/tasks/1146/attachments/att_07cb3d3a-2d5c-47bd-bd7a-72f4ccb8d5c8.png)
![Search overlay light at 390×844; input verified 44px high](/api/tasks/1146/attachments/att_d2841e59-395c-4ce8-b86d-cdc50b6cb2df.png)
![Task detail dark at 390×844](/api/tasks/1146/attachments/att_6efc7e54-a9fb-4e32-97f0-b723de9fad9b.png)
![Settings dark at 390×844](/api/tasks/1146/attachments/att_17240e43-207b-4a19-9e85-6bf5c75131ad.png)
![Checks dark at 390×844](/api/tasks/1146/attachments/att_558a7105-b050-4b2f-889a-db6879b7231f.png)
![Stories dark at 390×844](/api/tasks/1146/attachments/att_6df36a4a-1683-4c03-822c-650e4cb21f64.png)

## Activity

- 2026-11-17T02:53:04Z · created · t@t
- 2026-11-17T02:53:05Z · screenshots
- 2026-11-17T02:53:14Z · cli_override, model_override
- 2026-11-17T02:53:54Z · status inbox→ready
- 2026-11-17T02:53:57Z · status ready→active, branch
- 2026-11-17T03:10:30Z · body
- 2026-11-17T03:11:34Z · message_queued at 2026-11-17T03:11:34.656Z
- 2026-11-17T03:14:34Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-17T03:14:39Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-17T03:14:40Z · message_delivered: 1 message(s)
- 2026-11-17T03:18:09Z · message_queued at 2026-11-17T03:18:09.907Z
- 2026-11-17T03:21:24Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-17T03:21:25Z · message_delivered: 1 message(s)
- 2026-11-17T03:23:08Z · status active→review
- 2026-11-17T03:23:08Z · message_queued at 2026-11-17T03:23:08.385Z
- 2026-11-17T03:23:08Z · note: shots: skipped — the diff (3 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-17T03:27:39Z · note: review pass 1: needs some work
- 2026-11-17T03:27:39Z · message_delivered: 1 message(s)
- 2026-11-17T03:27:40Z · status review→active
- 2026-11-17T03:33:22Z · screenshots
- 2026-11-17T03:33:24Z · screenshots
- 2026-11-17T03:33:26Z · screenshots
- 2026-11-17T03:33:27Z · screenshots
- 2026-11-17T03:33:29Z · screenshots
- 2026-11-17T03:33:31Z · screenshots
- 2026-11-17T03:33:34Z · screenshots
- 2026-11-17T03:35:49Z · screenshots
- 2026-11-17T03:35:52Z · screenshots
- 2026-11-17T03:35:54Z · screenshots
- 2026-11-17T03:35:56Z · screenshots
- 2026-11-17T03:35:58Z · screenshots
- 2026-11-17T03:36:51Z · body
- 2026-11-17T03:37:26Z · screenshots
- 2026-11-17T03:37:28Z · screenshots
- 2026-11-17T03:39:58Z · screenshots
- 2026-11-17T03:40:00Z · screenshots
- 2026-11-17T03:40:02Z · screenshots
- 2026-11-17T03:40:03Z · screenshots
- 2026-11-17T03:42:14Z · body
- 2026-11-17T03:44:27Z · message_queued at 2026-11-17T03:44:27.469Z
- 2026-11-17T03:44:30Z · message_delivered: 1 message(s)
- 2026-11-17T03:46:51Z · body
- 2026-11-17T03:47:50Z · CTO nudge: held — handoff gate is running
- 2026-11-17T03:49:48Z · note: ui verification passed: 1 of 1 shot captured with clean console
- 2026-11-17T03:49:48Z · message_queued at 2026-11-17T03:49:48.461Z
- 2026-11-17T03:50:12Z · message_delivered: 1 message(s)
