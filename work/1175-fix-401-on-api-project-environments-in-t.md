---
id: "1175"
title: Fix 401 on /api/project-environments in the handoff preview so UI verification stops flagging it
type: bug
status: review
priority: p2
area: [web, server]
assigned_to: ai
created_by: t@t
branch: feat/fix-401-on-api-project-environments-in-t
created_at: "2026-11-18T04:17:45Z"
updated_at: "2026-11-18T05:10:26Z"
---
## Problem
#1157 was blocked for several review passes (landed via Land anyway) because automated UI verification recorded HTTP 401 for /api/project-environments (Secrets page) in the no-auth handoff preview as a console error.
## Desired UX
Opening the Secrets page in the handoff preview produces no 401/console error, or verification treats this expected case correctly.
## Acceptance criteria
- Find why the Secrets page requests /api/project-environments unauthenticated in the preview and fix the cause (or send the preview's auth context).
- Add a test; re-run the shot flow for a Secrets page route and confirm no blocking issue.
- Check docs/qa/2026-11-web-qa-pass.md for any other still-open #1157 findings and fix or list them.
## Notes for AI
Related: #1164. Do not touch repoos.toml.

## Activity

- 2026-11-18T04:17:45Z · created · t@t
- 2026-11-18T04:54:21Z · status inbox→ready
- 2026-11-18T04:54:29Z · status ready→active, branch
- 2026-11-18T05:10:26Z · status active→review
