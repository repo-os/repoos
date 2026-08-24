---
id: "0277"
title: "Review round tracking: D#/R# counters stuck, review tab disappears in done state"
type: bug
status: inbox
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-24T15:57:39Z"
updated_at: "2026-08-24T16:00:11Z"
---
## Problem
Two related display bugs around review rounds:
1. After a 3rd review round (visible as 3 separate sessions for the reviewer in the tokens tab / individual sessions view), the task's D#/R# counters on the card and panel never advanced past D2/R2 (and later, in done state, showed D2 R1) — they should reflect the actual number of dev/review rounds (D3/R3 in this case).
2. The review tab disappears entirely once a task reaches done state, even though the review history is still relevant and useful to see. It should stay visible across all statuses, not just active/review.

## Fix
- Find where D#/R# counters are computed/displayed and make sure they match actual round counts (cross-check against the tokens tab's per-session data, which was correct).
- Keep the review tab visible in done state (and any other status) instead of hiding it.

## Activity

- 2026-08-24T16:00:11Z · body
