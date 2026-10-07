---
last_close_out_gate_ms: 314751
last_close_out_gate_at: "2026-10-07T16:10:44.838Z"
id: "0736"
title: Keep cancelled close-out execution ownership until the old run is terminal
type: bug
status: review
priority: p1
area: server
assigned_to: ai
created_by: hello@repoos.org
branch: feat/keep-cancelled-close-out-execution-owner
created_at: "2026-10-07T09:42:19Z"
updated_at: "2026-10-07T16:10:44Z"
review_passes: 1
---
## Problem
Verified driver incident #0712 on 2026-10-07: cancelling MTD while remote await remained alive, then requeueing the same task, replaced the job record/cancel flag. The old callback still owned the execution, leaving a new queued record with startedAt null and invalid cancellation identity. Recovery required waiting for old execution terminal before retry. #0729 repairs runner hangs but does not change integration-job/orchestrator ownership.

## Desired UX
Reject or safely defer requeue while a cancelled attempt is still executing. Persist per-attempt identity/generation; old callbacks must not update a newer task job. Stop MTD should remain attached to the actual execution until terminal, then retry can create a new attempt normally. Do not merely clear metadata to hide an alive run.

## Acceptance criteria
A deferred remote-validation promise regression: start A, cancel A, request B, resolve/reject A late; B must not lose its state/cancellation identity, and no two close-outs publish for the same task. Cover cancel then retry with restart/recovery and ensure CLI/UI use the same server-owned pipeline.

## Notes for AI
Independently reproduce against current main and running server before implementing; origin is this RepoOS driver, not a stale external-repo diagnosis. Current main8884057ebd58bf802b455bc492fbb8f4c65ad69f, linked running build0.5.66 hash736999358ee10fd970931493e62568e8f22db4943fd649239b89287924dc142b. integration-job.ts enqueue explicitly replaces cancelled records (lines219-240); confirm executing ownership in orchestrator with controlled promise test. Incident timestamps/details in opex docs/overnight-log-2026-10-06.md and #0712 notes. Hold until current #0729 release close-out lands; do not restart server, deploy runners, touch owner config or hand-edit tasks.

## Activity

- 2026-10-07T09:42:19Z · created · hello@repoos.org
- 2026-10-07T14:35:28Z · status inbox→ready
- 2026-10-07T14:35:50Z · status ready→active, branch
- 2026-10-07T14:57:47Z · body
- 2026-10-07T14:58:48Z · body
- 2026-10-07T15:00:50Z · body
- 2026-10-07T15:13:10Z · body
- 2026-10-07T15:21:41Z · status active→review
- 2026-10-07T15:21:44Z · note: shots: skipped — the diff (9 changed paths) touches no [[preview.paths]] globs — no UI change to capture
- 2026-10-07T15:22:58Z · note: review pass 1: good to go
- 2026-10-07T16:10:44Z · close-out gate completed in 315s

