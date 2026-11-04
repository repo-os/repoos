---
id: 1028
title: Tell the engineer the handoff result on its next turn; add non-blocking repoos handoff-status
type: feature
status: active
priority: p2
area: [server, core]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/tell-the-engineer-the-handoff-result-on-
created_at: "2026-11-04T07:04:31Z"
updated_at: "2026-11-04T08:27:46Z"
---
## Problem
A runner engineer requests handoff with `repoos mv <id> review` or the `::repoos-handoff-ready::` line and ends its turn, then hears nothing about the outcome. On #1016 (`pi` + deepseek-v4.1-flash, 2026-11-04) the engineer could not tell whether a review had started, so it kept calling the blocking `repoos review 1016` itself, a call of up to 25 minutes that races the server-owned handoff. A failed handoff (format, check failure, queued check slot) costs a whole turn plus a watchdog or CTO nudge cycle before the engineer learns of it. #1016 took about 2h25m from start to handoff.

## Desired UX
Request-then-end-turn stays the default. When the handoff gate finishes, RepoOS queues a message to the engineer, so its next turn opens with the result: "handoff passed, task is now in review" or "handoff failed at step <step>: <reason>". A non-blocking `repoos handoff-status <id>` prints the current step and outcome for an engineer or human who wants to check without waiting.

## Acceptance criteria
- On handoff pass, fail or deferral, RepoOS queues exactly one message to the engineer naming the outcome, the failing step and the reason (truncated), using the existing queued-message delivery. No duplicate on retry or resume.
- The message says what to do next: nothing after a pass; fix and request handoff again after a fail.
- `repoos handoff-status <id> [--json]` returns immediately with state (not requested, running, passed, failed, deferred), current step and reason, and never blocks or starts a handoff. It has an API route (CLI/API parity, `src/cli/api-route-parity.ts`).
- The engineer prompt tells runner agents to request handoff and end the turn, and not to call the blocking `repoos review`. A test asserts the prompt text.
- Tests use fakes only. Existing handoff, watchdog and CTO nudge tests still pass.

## Notes for AI
Evidence is in `.repoos/agent-logs/1016.out.log`. Touch the handoff gate and queued-message paths (`src/server/`, grep for `handoff_deferred` and `message_queued`) and `src/commands/control-api.ts` (`cmdReview`, `waitForReviewHandoff`). #0715 is changing the turn-ended-without-handoff and watchdog paths at the same time; keep to the outcome-message path and rebase on it if it lands first. Do not change `repoos review` itself for interactive sessions.

## Activity

- 2026-11-04T07:04:31Z · created · njachowski@gmail.com
- 2026-11-04T08:19:52Z · status inbox→ready
- 2026-11-04T08:19:55Z · status ready→active, branch
- 2026-11-04T08:27:46Z · message_queued at 2026-11-04T08:27:46.342Z
