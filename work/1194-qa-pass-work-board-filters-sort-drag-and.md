---
id: "1194"
title: "QA pass: Work board filters, sort, drag and column views at desktop and 375px"
type: bug
status: done
priority: p2
area: web
merged_commit: 50005aa26494b153f09b3551ec415d728dc40dd3
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-work-board-filters-sort-drag-and
created_at: "2026-11-18T18:47:40Z"
updated_at: "2026-11-18T18:54:40Z"
last_close_out_gate_ms: 78975
last_close_out_gate_at: "2026-11-18T18:54:36.435Z"
review_passes: 1
---
## Problem
Board filtering, sorting and view toggles have had many changes and no dedicated pass.
## Desired UX
Filters, sort, held/human toggles and column collapse behave consistently and survive reload.
## Acceptance criteria
- Drive the auth-less dev server (just serve-noauth from a scratch worktree) with headless Playwright only; never open a visible browser or the user's Chrome. Fix bugs with tests.
- Commit docs/qa/2026-11-work-board-filters.md.
## Notes for AI
Do not touch repoos.toml. Never open a visible browser window.

## Activity

- 2026-11-18T18:47:40Z · created · t@t
- 2026-11-18T18:47:43Z · status inbox→ready
- 2026-11-18T18:47:44Z · status ready→active, branch
- 2026-11-18T18:52:05Z · status active→review
- 2026-11-18T18:52:05Z · message_queued at 2026-11-18T18:52:05.787Z
- 2026-11-18T18:52:05Z · note: shots: skipped — the diff (3 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-18T18:52:23Z · note: review pass 1: good to go
- 2026-11-18T18:54:36Z · close-out gate completed in 79s
- 2026-11-18T18:54:40Z · status done→done, release:success
