---
id: "1057"
title: Card shows PAUSED during handoff; deferred handoff never wakes the engineer
type: bug
status: active
needs_input: true
needs_input_reason: dev-error
needs_input_detail: "2026-11-08T02:03:35.530915Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when Client(HttpRequest(HttpRequest(\"http/request failed: error sending request for url (https://chatgpt.com/backend-api/ps/mcp)\")))"
priority: p2
area: [web, core]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/card-shows-paused-during-handoff-deferre
cli_override: codex
model_override: gpt-6-luna
review_cli_override: codex
review_model_override: gpt-6.1-terra
created_at: "2026-11-08T00:26:09Z"
updated_at: "2026-11-08T02:03:45Z"
check_retry_count: 2
last_check_failure: "repoos check at 2026-11-08T02:03:13.154Z: repoos check failed: tests — ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯"
handoff_signal_retry_count: 1
dev_error_count: 2
engineer_crash_log: "[{\"cli\":\"codex\",\"model\":\"gpt-6-luna\",\"at\":\"2026-11-08T02:03:29.214Z\",\"kind\":\"dev-error\"},{\"cli\":\"codex\",\"model\":\"gpt-6-luna\",\"at\":\"2026-11-08T02:03:45.869Z\",\"kind\":\"dev-error\"}]"
---
## Problem
Two related lifecycle bugs seen on 2026-11-08:
1. **Card says PAUSED while a handoff is running.** #1044's engineer ended its turn with `::repoos-handoff-ready::` and the server's handoff was running (step: verify, remote shot capture), yet the board card showed "PAUSED" with a "Restart work" button. The card derives its label from "is an engineer process running" and does not treat a server-side handoff in flight (or one in its verify/capture phase) as an active state. #1054 fixed the Restart button for the "running checks" hint, but the PAUSED label path does not use the same handoff-in-flight signal.
2. **Deferred handoff deadlocks when no engineer is running.** #1050's engineer exited ("no handoff requested") with a driver message still queued. The handoff status became `deferred: 1 queued message(s) must be read before review`, but nothing started the engineer to read the message, so the task sat for about 30 minutes until a human ran `repoos start 1050`. The same shape appeared on #1054, #1048 and #1049 earlier (handoff deferred for tens of minutes while no turn was running).

## Desired UX
1. The card label is derived from the single server-backed handoff-in-flight signal: while a handoff or check is running (any step including verify/capture), show "Running checks · <step>" (or the existing running-checks line), never PAUSED, and no Restart/Pause button. PAUSED is shown only when the task really is paused (an explicit `pause`) or truly idle with nothing in flight and no queued work.
2. When a handoff is deferred because queued messages must be read and no engineer turn is running, the server automatically starts (resumes) the engineer so it reads the queued message(s), with a short activity line ("↻ resuming engineer to read queued message"), bounded by the existing retry limits so it cannot loop. If an engineer turn is already running, do nothing (the message delivers when it ends).

## Acceptance criteria
- Test: a task with no running engineer but a running handoff (steps: check, verify, review, capture) renders the running-checks state, not PAUSED, with no primary button.
- Test: an explicitly paused task still renders PAUSED with Restart work.
- Test: a deferred handoff with queued messages and no running engineer triggers exactly one auto-resume per deferral (guarded against loops by a retry counter), and does not trigger while a turn is running.
- Activity feed records the auto-resume reason.
- `repoos check --changed main` passes; UI rebuilt (if UI touched).

## Notes for AI
Start from TaskCard.vue (the label/action computed near `ACTIVE_RESTART`), stores/repo.ts (`handoffInFlight`, `handoffStatuses`), src/server/handoff.ts (the "queued message(s) must be read before review" deferral) and the existing automatic-resume machinery (`MAX_CHECK_RETRY_ATTEMPTS`, `MAX_HANDOFF_SIGNAL_RETRY_ATTEMPTS`) which should be reused for the retry cap. Do not change AGENTS.md rules about who moves tasks out of active.

## Activity

- 2026-11-08T00:26:09Z · created · njachowski@gmail.com
- 2026-11-08T00:26:12Z · cli_override, model_override, review_cli_override, review_model_override
- 2026-11-08T00:26:14Z · status inbox→ready
- 2026-11-08T00:27:23Z · review_model_override
- 2026-11-08T00:31:19Z · status ready→active, branch
- 2026-11-08T00:41:56Z · message_queued at 2026-11-08T00:41:56.754Z
- 2026-11-08T00:41:56Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-08T00:42:56Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-08T00:51:05Z · body
- 2026-11-08T01:00:16Z · body
- 2026-11-08T01:02:01Z · CTO nudge: held — handoff gate is running
- 2026-11-08T01:31:44Z · message_queued at 2026-11-08T01:31:44.081Z
- 2026-11-08T01:31:47Z · message_delivered: 1 message(s)
- 2026-11-08T01:31:47Z · message_queued at 2026-11-08T01:31:47.273Z
- 2026-11-08T01:32:56Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-08T01:38:38Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-08T01:40:16Z · body
- 2026-11-08T01:41:01Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-08T01:41:01Z · message_queued at 2026-11-08T01:41:01.137Z
- 2026-11-08T01:41:01Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code unknown · last assistant: The rerun passed: remote validation completed the changed-path tests, and the local formatting, lint, build, rendered contrast, and UI smoke steps also passed. The handoff timeout did not reproduce, so I’m requesting handoff again with the… · stderr: (empty)
- 2026-11-08T01:41:01Z · message_delivered: 2 message(s)
- 2026-11-08T01:43:14Z · CTO nudge: held — handoff gate is running
- 2026-11-08T02:03:10Z · message_queued at 2026-11-08T02:03:10.054Z
- 2026-11-08T02:03:13Z · message_delivered: 1 message(s)
- 2026-11-08T02:03:14Z · message_queued at 2026-11-08T02:03:14.908Z
- 2026-11-08T02:03:15Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-08T02:03:29Z · agent exited with an error (codex) · 2026-11-08T02:03:18.737057Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when Client(HttpRequest(HttpRequest("http/request failed: error sending request for url (https://chatgpt.com/backend-api/ps/mcp)")))
- 2026-11-08T02:03:29Z · engineer crash recovery: resuming codex + gpt-6-luna (1/3 crashes in 30m) · 2026-11-08T02:03:18.737057Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when Client(HttpRequest(HttpRequest("http/request failed: error sending request for url (https://chatgpt.com/backend-api/ps/mcp)…
- 2026-11-08T02:03:29Z · needs_input
- 2026-11-08T02:03:30Z · message_delivered: 1 message(s)
- 2026-11-08T02:03:45Z · agent exited with an error (codex) · 2026-11-08T02:03:35.530915Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when Client(HttpRequest(HttpRequest("http/request failed: error sending request for url (https://chatgpt.com/backend-api/ps/mcp)")))
- 2026-11-08T02:03:45Z · engineer crash recovery: resuming codex + gpt-6-luna (2/3 crashes in 30m) · 2026-11-08T02:03:35.530915Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when Client(HttpRequest(HttpRequest("http/request failed: error sending request for url (https://chatgpt.com/backend-api/ps/mcp)…
