---
id: "1199"
title: "QA pass: Stories page and story detail – every state at desktop and 375px"
type: bug
status: done
priority: p2
area: web
merged_commit: 9d7e7876dd3ca00a8b3bb4fad3e2c04d78afdb2f
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-stories-page-and-story-detail-ev
created_at: "2026-11-18T19:47:44Z"
updated_at: "2026-11-18T20:03:35Z"
last_close_out_gate_ms: 73249
last_close_out_gate_at: "2026-11-18T19:59:32.607Z"
review_passes: 1
---
## Problem
Stories cards and detail views changed recently (#1150) and need a full pass.
## Desired UX
Stories list, empty states, story detail, linked tasks and filters work at 1280 and 375px.
## Acceptance criteria
- Headless Playwright only against the auth-less dev server (just serve-noauth from a scratch worktree); never open a visible browser or the user's Chrome. Fix bugs with tests.
- Commit docs/qa/2026-11-stories-detail.md.
## Notes for AI
Do not touch repoos.toml. Never open a visible browser window.

## Activity

- 2026-11-18T19:47:44Z · created · t@t
- 2026-11-18T19:47:47Z · status inbox→ready
- 2026-11-18T19:47:49Z · status ready→active, branch
- 2026-11-18T19:49:51Z · note: adopted orphaned engineer pid 1671
- 2026-11-18T19:52:43Z · CTO nudge: held — handoff gate is running
- 2026-11-18T19:54:19Z · status active→review
- 2026-11-18T19:54:20Z · message_queued at 2026-11-18T19:54:20.577Z
- 2026-11-18T19:54:20Z · note: shots: skipped — the diff (3 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-18T19:54:43Z · note: review pass 1: good to go
- 2026-11-18T19:59:32Z · close-out gate completed in 73s
- 2026-11-18T19:59:35Z · status done→done, release:success
- 2026-11-18T20:03:35Z · message_dropped: 1 queued message(s) discarded — task is done
