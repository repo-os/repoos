---
id: "0969"
title: "Server freezes (4/4): measure latency at 900 tasks for 1 h"
type: chore
status: inbox
priority: p2
area: core
depends_on: ["0965", "0966", "0967"]
assigned_to: ""
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-27T12:03:17Z"
updated_at: "2026-10-27T12:03:17Z"
---
## Problem
Split from #0962: the original acceptance criterion 6 needs a measurement once the git work has landed.

## Desired UX
We know, with numbers, that the server stays fast.

## Acceptance criteria
- [ ] With ~900 tasks / ~100 branches, /api/auth/session and the task list answer in <200 ms warm and within 5 s of boot, and stay that way for 1 h with two engineers running; record the numbers in docs/.

## Notes for AI
Depends on the git-reads, batched-queries and request-timing tasks. Measurement only; file follow-ups for anything slow.

## Activity

- 2026-10-27T12:03:17Z · created · njachowski@gmail.com
