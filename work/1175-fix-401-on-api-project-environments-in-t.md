---
id: "1175"
title: Fix 401 on /api/project-environments in the handoff preview so UI verification stops flagging it
type: bug
status: done
priority: p2
area: [web, server]
merged_commit: 4114762540a50a22d09fe70331389324be7a6e31
assigned_to: ai
created_by: t@t
branch: feat/fix-401-on-api-project-environments-in-t
created_at: "2026-11-18T04:17:45Z"
updated_at: "2026-11-18T05:49:09Z"
last_close_out_gate_ms: 560758
last_close_out_gate_at: "2026-11-18T05:48:43.100Z"
review_passes: 1
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

## Shots
```json
[
{
"label": "Secrets page without authenticated API requests",
"target": "default",
"route": "/secrets",
"highlight": ".secrets-ledger",
"state": "secrets:populated"
}
]
```

## Activity

- 2026-11-18T04:17:45Z · created · t@t
- 2026-11-18T04:54:21Z · status inbox→ready
- 2026-11-18T04:54:29Z · status ready→active, branch
- 2026-11-18T04:55:59Z · body
- 2026-11-18T04:59:13Z · body
- 2026-11-18T05:04:32Z · body
- 2026-11-18T05:07:12Z · CTO nudge: held — handoff gate is running
- 2026-11-18T05:10:25Z · note: ui verification passed: 1 of 1 shot captured with clean console
- 2026-11-18T05:10:26Z · status active→review
- 2026-11-18T05:10:26Z · message_queued at 2026-11-18T05:10:26.641Z
- 2026-11-18T05:10:59Z · note: review pass 1: good to go
- 2026-11-18T05:48:43Z · close-out gate completed in 561s
- 2026-11-18T05:49:09Z · status done→done, release:success
