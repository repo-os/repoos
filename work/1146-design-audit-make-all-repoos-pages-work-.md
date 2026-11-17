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
updated_at: "2026-11-17T03:33:31Z"
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
