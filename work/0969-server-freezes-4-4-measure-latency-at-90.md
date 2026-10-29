---
id: "0969"
title: "Server freezes (4/4): measure latency at 900 tasks for 1 h"
type: chore
status: done
priority: p2
area: core
depends_on: ["0965", "0966", "0967"]
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-27T12:03:17Z"
updated_at: "2026-10-29T13:36:13Z"
---
## Problem
Split from #0962: the original acceptance criterion 6 needs a measurement once the git work has landed.

## Desired UX
We know, with numbers, that the server stays fast.

## Acceptance criteria
- [ ] With ~900 tasks / ~100 branches, /api/auth/session and the task list answer in <200 ms warm and within 5 s of boot, and stay that way for 1 h with two engineers running; record the numbers in docs/.

## Notes for AI
Depends on the git-reads, batched-queries and request-timing tasks. Measurement only; file follow-ups for anything slow.

## Resolution
Measured by the driver on 2026-10-29 (12:36–13:36Z, 931 tasks, ~50 branches, 2–3 engineers): session median 4.0 ms / p95 14.7 ms / max 55 ms; task list median 3.6 ms / p95 11.9 ms / max 173 ms; 0 errors, 0 over 200 ms. Both answered 7.5 s after `just revive` started (includes shutdown and launchd restart; the 5 s boot target was not measured directly). Numbers recorded in docs/server-git-worker.md. No branch.

## Activity

- 2026-10-27T12:03:17Z · created · njachowski@gmail.com
- 2026-10-29T13:36:09Z · body: Resolution (added)
- 2026-10-29T13:36:13Z · status inbox→done
