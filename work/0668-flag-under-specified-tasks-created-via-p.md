---
id: "0668"
title: Flag under-specified tasks created via POST /api/tasks and repoos new
type: bug
status: done
priority: p2
area: server
merged_commit: 59a2eaaaf1790c05aab170c066f69e461cc547a2
assigned_to: ai
created_by: ""
branch: feat/flag-under-specified-tasks-created-via-p
created_at: "2026-10-05T09:10:45Z"
updated_at: "2026-10-05T11:15:25Z"
---
## Problem
`flagUnderspecifiedIfNeeded` (src/server/task-underspecified-flag.ts) only runs on PM flesh-out completion, body/section PATCHes, draft promotion and task start (src/server/routes/tasks.ts). Tasks created through the plain create path (`POST /api/tasks`, `repoos new`) with a stub body, e.g. #0658-#0667 (Cloud attachment storage story), are never assessed, so they never get needs_input / the Send to PM action even though they fail assessTaskUnderspecified (missing spec sections, under 400 chars).

## Desired UX
Stub tasks are flagged as needing input the moment they exist, however they were created, and stubs already on the board get flagged too.

## Acceptance criteria
- [ ] POST /api/tasks and `repoos new` assess the new task and flag it when underspecified.
- [ ] A one-time sweep at boot / index load flags existing underspecified non-terminal tasks, without clobbering other needs_input reasons.
- [ ] Tests cover create-path flagging and the sweep (idempotent; no re-flag churn).
- [ ] Docs touching the underspecified flag are updated if wording changes.

## Notes for AI
Reuse flagUnderspecifiedIfNeeded; it already preserves unrelated needs_input reasons. Limit the sweep to tasks that are not done/review. CLI create runs outside the server, so flag via the server or the sweep.

## Activity

- 2026-10-05T09:10:45Z · created · unknown
- 2026-10-05T09:23:16Z · status inbox→ready
- 2026-10-05T09:23:17Z · status ready→active, branch
- 2026-10-05T10:32:04Z · status active→review
- 2026-10-05T11:15:25Z · status review→done, release:success
