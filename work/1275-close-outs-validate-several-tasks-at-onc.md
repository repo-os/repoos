---
id: "1275"
title: "Close-outs: validate several tasks at once on different runner machines"
type: feature
status: active
priority: p1
area: [server, core]
assigned_to: ai
created_by: t@t
branch: feat/close-outs-validate-several-tasks-at-onc
cli_override: claude code
model_override: haiku
created_at: "2026-11-20T07:42:13Z"
updated_at: "2026-11-20T08:05:35Z"
---
## Problem
The close-out queue runs one job at a time (queuePosition 0 validating, everything else queued) even when other runner machines (bee, mini) are idle. A full validation takes 20-25 minutes, so 11 queued tasks means about 4 hours, and one slow or failing job blocks all of them. Observed 2026-11-20: thinkpad ran #1258 for ~55 min while bee and mini had free slots and 10 green tasks waited.

## Desired UX
Validation of different queued tasks runs in parallel across available runner machines (bounded by free slots and the memory pressure guard). Publishing to main stays strictly serial under the existing lock, in queue order, and each job's candidate is rebuilt on the latest main right before publish if main moved. A failure in one job never blocks the others.

## Acceptance criteria
- Configurable max parallel validations (default small, e.g. 2) with a Settings control per the repo rule for user-facing settings.
- Validation phase can overlap across tasks; publish phase serial; a job whose base main moved re-validates only what is needed (or cheaply re-merges) before publishing, never publishing a stale candidate.
- Host choice keeps the existing fewest-active-runs rule and the pressure guard.
- Queue position and phase shown correctly in the UI and integration-job API for overlapping jobs.
- Tests for overlap, ordering, stale-base handling and failure isolation; docs/close-out-pipeline.md updated.

## Notes for AI
Read docs/close-out-pipeline.md and docs/remote-validation.md first. Never touch repoos.toml. Safety of main beats speed: if overlapping validation cannot be proven safe, fail closed and keep serial for that job.

## Activity

- 2026-11-20T07:42:13Z · created · t@t
- 2026-11-20T07:42:19Z · status inbox→ready
- 2026-11-20T07:46:48Z · cli_override, model_override
- 2026-11-20T07:46:49Z · status ready→active, branch
- 2026-11-20T08:02:31Z · message_queued at 2026-11-20T08:02:31.538Z
- 2026-11-20T08:02:31Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-20T08:02:38Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-20T08:05:34Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-20T08:05:35Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 143) · last assistant: The `repoos check` run is still going on the thinkpad runner, so I'm waiting on it before reporting. The monitor will fire when the process exits, or when its 10-minute window expires. · stderr: (empty)
- 2026-11-20T08:05:35Z · message_delivered: 1 message(s)
