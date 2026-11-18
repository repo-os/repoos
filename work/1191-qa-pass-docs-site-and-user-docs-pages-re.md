---
id: "1191"
title: "QA pass: docs site and user-docs pages render, links and search"
type: bug
status: review
priority: p2
area: docs
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-docs-site-and-user-docs-pages-re
created_at: "2026-11-18T16:18:29Z"
updated_at: "2026-11-18T16:27:10Z"
---
## Problem
The docs pages and in-app help links may have dead links or broken rendering after many doc changes.
## Desired UX
Every in-app help link resolves, docs pages render correctly and search finds pages.
## Acceptance criteria
- Drive the auth-less dev server (just serve-noauth from a scratch worktree) with headless Playwright only; never open a visible browser or the user's Chrome. Fix bugs with tests.
- Commit docs/qa/2026-11-docs-site.md.
## Notes for AI
Do not touch repoos.toml. Never open a visible browser window.

## Activity

- 2026-11-18T16:18:29Z · created · t@t
- 2026-11-18T16:18:43Z · status inbox→ready
- 2026-11-18T16:18:50Z · status ready→active, branch
- 2026-11-18T16:26:37Z · status active→review
- 2026-11-18T16:26:37Z · message_queued at 2026-11-18T16:26:37.308Z
- 2026-11-18T16:26:37Z · note: shots: skipped — the diff (3 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-18T16:27:10Z · note: review pass 1: good to go
