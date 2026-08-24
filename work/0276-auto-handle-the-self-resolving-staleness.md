---
id: "0276"
title: Auto-handle the self-resolving staleness check in MTD instead of routing through the debugger
type: bug
status: inbox
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-24T15:57:24Z"
updated_at: "2026-08-24T16:00:03Z"
---
## Problem
The engineer's own repair-run notes described the failure as "the same self-resolving staleness pattern seen before (the check runs against the pre-build tree, then the build within this same invocation refreshes it)." If this is a known, self-resolving pattern, forcing it through the full debugger → engineer repair detour every time is wasted time and cost.

## Fix
Identify this staleness pattern in the MTD flow (check runs against pre-build tree, build refreshes it) and handle it automatically — e.g. retry the check once after build within the same MTD invocation — instead of surfacing it as a failure that routes to the debugger.

May be the same root cause as the merge conflict in #0271.

## Activity

- 2026-08-24T16:00:03Z · body
