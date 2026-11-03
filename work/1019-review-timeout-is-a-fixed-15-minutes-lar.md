---
last_close_out_gate_ms: 747455
last_close_out_gate_at: "2026-11-03T20:57:51.162Z"
id: 1019
title: "Review timeout is a fixed 15 minutes: large diffs fail with 'no usable report' and burn review rounds"
type: bug
status: review
priority: p1
area: [server, core]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/review-timeout-is-a-fixed-15-minutes-lar
created_at: "2026-11-03T19:16:59Z"
updated_at: "2026-11-03T20:57:51Z"
review_passes: 1
---
## Problem
`REVIEW_TIMEOUT_MS` is a hard-coded 900,000 ms (15 minutes) in `src/server/review.ts` (~line 190), with no setting for it. On 2026-11-03, #1013 (39 changed files) failed two review passes in a row on `opencode-go/mimo-v2.6-flash` (16:52 and 17:07: "review pass N: failed — no usable report"). The logs show the reviewer still working through tool calls when it was cut off at ~15 minutes. #0997 hit the same limit earlier (reviewer session errored at 900,023 ms). A third pass on a different model finished in about a minute and passed, so the diff was reviewable; the first model was just slow. Each failure also set needs_input and needed a human or driver to run `repoos review again`.

## Desired UX
- The review timeout scales with the work or is configurable, so a large diff on a slow cheap model is not killed mid-review.
- When a review is cut off by the timeout, the activity line and the Review tab say "review timed out after N minutes" instead of "no usable report", and RepoOS retries once automatically (optionally on the next allowed reviewer model) before asking for a human.

## Acceptance criteria
- [ ] Add a Settings control and `getConfigSchema()` entry for the review timeout (default stays 15 minutes, or scales with changed-file count), with a test; document it in `user-docs/configuration.md`.
- [ ] A timeout is reported as a timeout (distinct from a reviewer that exited without a report) in the task activity and Review tab.
- [ ] One automatic retry after a timeout, bounded, and visible in the activity log; no retry loop.
- [ ] Tests cover timeout classification and the single retry.

## Notes for AI
Evidence: `.repoos/agent-logs/review:1013.*` logs, activity lines at 16:52:36Z and 17:07:47Z on #1013. Start at `src/server/review.ts` (`REVIEW_TIMEOUT_MS`, the `timed out after` branches ~lines 1638 and 2072). Follow `docs/api-keys.md`-style rules only if a key is involved (none here). Never edit `repoos.toml`.

## Activity

- 2026-11-03T19:16:59Z · created · njachowski@gmail.com
- 2026-11-03T19:17:04Z · status inbox→ready
- 2026-11-03T19:17:07Z · status ready→active, branch
- 2026-11-03T19:32:10Z · message_queued at 2026-11-03T19:32:10.941Z
- 2026-11-03T19:32:11Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-03T19:37:10Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-03T20:04:01Z · body
- 2026-11-03T20:07:44Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-03T20:07:44Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-11-03T20:07:45Z · message_delivered: 1 message(s)
- 2026-11-03T20:25:02Z · status active→review
- 2026-11-03T20:26:08Z · note: review pass 1: good to go
- 2026-11-03T20:38:13Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (be9f01ce9) during finalization (#0734)
- 2026-11-03T20:57:51Z · close-out gate completed in 747s

