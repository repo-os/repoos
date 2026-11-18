---
id: "1190"
title: "QA pass: remote runners and Checks Remote tab – states and errors"
type: bug
status: done
priority: p2
area: [web, server]
merged_commit: 75209a9e3c7f68db921cc31e2924ce5c3a905576
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-remote-runners-and-checks-remote
created_at: "2026-11-18T16:18:04Z"
updated_at: "2026-11-18T16:57:47Z"
last_close_out_gate_ms: 605528
last_close_out_gate_at: "2026-11-18T16:56:59.420Z"
review_passes: 1
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

## Shots
```json
[
{
"label": "Busy runner with queued work",
"target": "default",
"route": "/checks?tab=now",
"highlight": ".rr-host[data-health=busy]",
"state": "runners:queued"
}
]
```

## Activity

- 2026-11-18T16:18:04Z · created · t@t
- 2026-11-18T16:18:14Z · status inbox→ready
- 2026-11-18T16:18:19Z · status ready→active, branch
- 2026-11-18T16:28:35Z · body
- 2026-11-18T16:30:36Z · body
- 2026-11-18T16:31:54Z · body
- 2026-11-18T16:34:35Z · CTO nudge: held — handoff gate is running
- 2026-11-18T16:44:40Z · note: ui verification passed: 1 of 1 shot captured with clean console
- 2026-11-18T16:44:42Z · status active→review
- 2026-11-18T16:44:42Z · message_queued at 2026-11-18T16:44:42.957Z
- 2026-11-18T16:45:47Z · note: review pass 1: good to go
- 2026-11-18T16:56:59Z · close-out gate completed in 606s
- 2026-11-18T16:57:26Z · status done→done, release:success
- 2026-11-18T16:57:47Z · message_dropped: 1 queued message(s) discarded — task is done
