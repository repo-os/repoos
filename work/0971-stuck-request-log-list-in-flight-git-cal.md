---
id: "0971"
title: "STUCK request log: list in-flight git calls and their age"
type: feature
status: done
priority: p2
area: core
depends_on: ["0962", "0967"]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/stuck-request-log-list-in-flight-git-cal
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-27T22:11:30Z"
updated_at: "2026-10-29T05:50:04Z"
check_retry_count: 1
last_check_failure: "repoos check at 2026-10-29T05:43:49.958Z: repoos check failed: tests — timed out — timed out after 2400s"
handoff_signal_retry_count: 1
---
## Problem
#0967 landed per-request timing and a STUCK log line, but the STUCK line only names the route and its age; it cannot list the in-flight git calls because the git worker that tracks them lands with #0962.

## Desired UX
A STUCK line names the route, its age, and each in-flight git call with its age, so a freeze can be traced to the slow git command.

## Acceptance criteria
- [ ] Once #0962's git worker is on main, `formatStuckRequest` includes the worker's in-flight calls (command + age); remove the TODO(#0962) in src/server/request-timing.ts.
- [ ] src/ui-app/tests/request-timing.test.ts asserts the git detail with a fake worker.

## Notes for AI
Small. Run only the affected tests; never restart the RepoOS server or request a preview; do not touch repoos.toml.

## Activity

- 2026-10-27T22:11:30Z · created · njachowski@gmail.com
- 2026-10-29T04:31:33Z · cli_override, model_override
- 2026-10-29T04:31:59Z · status inbox→ready
- 2026-10-29T04:32:14Z · status ready→active, branch
- 2026-10-29T04:33:20Z · message_queued at 2026-10-29T04:33:20.853Z
- 2026-10-29T04:48:05Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-10-29T04:48:06Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-29T04:48:07Z · message_delivered: 1 message(s)
- 2026-10-29T04:48:42Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-29T05:44:27Z · engineer stopped by request
- 2026-10-29T05:44:27Z · held, held-reason, held-by, held-at
- 2026-10-29T05:49:28Z · released
- 2026-10-29T05:50:04Z · status active→done
