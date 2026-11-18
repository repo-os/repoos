---
id: "1206"
title: "QA pass: Releases page cut flow with fixtures – notes chooser, blockers, in-progress and failed states at 375px"
type: bug
status: review
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-releases-page-cut-flow-with-fixt
created_at: "2026-11-18T22:17:29Z"
updated_at: "2026-11-18T22:32:45Z"
review_rounds: 1
routing_switches: 1
review_passes: 1
---
## Problem
The Releases cut flow is the most consequential screen and changed a lot (AI notes, publish modes); phone width and failure states need another pass.
## Desired UX
Chooser, blockers, running, failed and done states are clear and usable at 1280 and 375px.
## Acceptance criteria
- Headless Playwright only against the auth-less dev server (just serve-noauth from a scratch worktree) with intercepted release APIs; NEVER publish a real release. Fix bugs with tests.
- Commit docs/qa/2026-11-releases-cut-flow.md.
## Notes for AI
Do not touch repoos.toml. Never open a visible browser window.

## Activity

- 2026-11-18T22:17:29Z · created · t@t
- 2026-11-18T22:17:32Z · status inbox→ready
- 2026-11-18T22:17:34Z · status ready→active, branch
- 2026-11-18T22:27:47Z · status active→review
- 2026-11-18T22:27:47Z · message_queued at 2026-11-18T22:27:47.723Z
- 2026-11-18T22:27:47Z · note: shots: skipped — the diff (4 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-18T22:28:15Z · note: review pass 1: needs some work
- 2026-11-18T22:28:16Z · message_delivered: 1 message(s)
- 2026-11-18T22:28:16Z · status review→active
- 2026-11-18T22:32:21Z · status active→review
- 2026-11-18T22:32:21Z · message_queued at 2026-11-18T22:32:21.684Z
- 2026-11-18T22:32:21Z · note: shots: skipped — the diff (6 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-18T22:32:45Z · note: review pass 2: good to go
