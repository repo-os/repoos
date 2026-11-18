---
id: "1190"
title: "QA pass: remote runners and Checks Remote tab – states and errors"
type: bug
status: review
priority: p2
area: [web, server]
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-remote-runners-and-checks-remote
created_at: "2026-11-18T16:18:04Z"
updated_at: "2026-11-18T16:44:42Z"
---
## Problem
The Remote runners tab shows host load, health and failures; recent flaky runs show it needs a hands-on pass.
## Desired UX
Each runner state (healthy, busy, unreachable, failing) renders clearly with helpful errors at 1280 and 375 widths.
## Acceptance criteria
- Drive the auth-less dev server (just serve-noauth from a scratch worktree) with headless Playwright only; never open a visible browser or the user's Chrome. Fix bugs with tests.
- Commit docs/qa/2026-11-remote-runners.md.
## Notes for AI
Do not touch repoos.toml. Never open a visible browser window.

## Activity

- 2026-11-18T16:18:04Z · created · t@t
- 2026-11-18T16:18:14Z · status inbox→ready
- 2026-11-18T16:18:19Z · status ready→active, branch
- 2026-11-18T16:44:42Z · status active→review
