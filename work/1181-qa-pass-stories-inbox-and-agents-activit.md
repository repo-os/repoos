---
id: "1181"
title: "QA pass: Stories, Inbox and Agents-activity views – desktop and 375px"
type: bug
status: review
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-stories-inbox-and-agents-activit
created_at: "2026-11-18T08:49:05Z"
updated_at: "2026-11-18T08:56:20Z"
---
## Problem
Stories, Inbox and activity-style views have not had a recent hands-on QA pass.
## Desired UX
Lists, empty states, filters and drawers render and behave correctly at 1280 and 375 widths with no console errors.
## Acceptance criteria
- Drive the auth-less dev server (just serve-noauth from a worktree) with fixtures; fix bugs with tests.
- Commit docs/qa/2026-11-stories-inbox.md.
## Notes for AI
Do not touch repoos.toml; skip what #1157/#1170/#1173/#1178 covered.

## Activity

- 2026-11-18T08:49:05Z · created · t@t
- 2026-11-18T08:49:09Z · status inbox→ready
- 2026-11-18T08:49:12Z · status ready→active, branch
- 2026-11-18T08:54:52Z · note: adopted orphaned engineer pid 10765
- 2026-11-18T08:56:19Z · status active→review
- 2026-11-18T08:56:19Z · message_queued at 2026-11-18T08:56:19.941Z
- 2026-11-18T08:56:20Z · note: shots: skipped — the diff (3 changed paths) touches no capture target's globs — no UI change to capture
