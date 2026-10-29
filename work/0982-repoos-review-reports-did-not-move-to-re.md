---
id: "0982"
title: "repoos review reports \"did not move to review\" while the handoff is still running"
type: bug
status: done
priority: p2
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/repoos-review-reports-did-not-move-to-re
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-29T14:44:40Z"
updated_at: "2026-10-29T15:41:06Z"
---
## Problem
`repoos review <id>` printed "✗ handoff did not move task to review" several times on 2026-10-28/29 while the server's handoff was still running its check; minutes later the task reached review. The command gives up waiting and reports a failure that did not happen, so drivers re-ran handoffs or took over tasks unnecessarily.

## Desired UX
`repoos review` waits for the handoff to finish (or until its own clearly stated timeout) and reports the real outcome: moved to review, stopped at a named step with the reason, or still running with how to follow it.

## Acceptance criteria
- While server finalization is still running, the command keeps waiting (following the handoff's progress), up to the handoff deadline; on its own timeout it says "still running — check with repoos show <id>", never "did not move".
- On a real failure it prints the failed step and reason from the finalization record.
- Tests with a fake server: success after a long check; failure with reason; client timeout while still running.

## Notes for AI
CLI side: `src/commands/control-api.ts` (review). Server: `src/server/handoff.ts` finalization state. Do not edit repoos.toml.

## Activity

- 2026-10-29T14:44:40Z · created · njachowski@gmail.com
- 2026-10-29T14:45:19Z · cli_override, model_override
- 2026-10-29T14:45:24Z · status inbox→ready
- 2026-10-29T14:45:27Z · status ready→active, branch
- 2026-10-29T14:54:14Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-29T14:58:35Z · watchdog: check wait escalated · waiting: waiting for a local check slot (2 ahead, position 3); waiting behind #0981 check (pid 66147, alive), #0978 check (pid 67065, alive) for 10m · next step: let it finish — the wait clears itself when the check starts running; investigate only if it persists
- 2026-10-29T15:17:31Z · held, held-reason, held-by, held-at
- 2026-10-29T15:40:58Z · released
- 2026-10-29T15:41:03Z · status active→done
- 2026-10-29T15:41:06Z · watchdog: check wait ended — cleared needs_input
