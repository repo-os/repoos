---
id: "1273"
title: "QA pass: login, lock screen and session expiry flows"
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-login-lock-screen-and-session-ex
cli_override: claude code
model_override: haiku
created_at: "2026-11-20T07:06:52Z"
updated_at: "2026-11-20T13:26:37Z"
handoff_signal_retry_count: 2
last_check_failure: "repoos check at 2026-11-20T09:15:23.483Z: repoos check failed: server-side finalization timed out (deadline exceeded)"
---
## Problem
Sweep sign-in, lock screen and session-expiry flows (code entry, errors, expired session, offline) for layout, wording and state bugs.

## Desired UX
Flows look and behave correctly at 375, 768 and 1280 widths: no overflow, clear labels, sensible error and loading states, visible keyboard focus.

## Acceptance criteria
- Walked headlessly (Playwright only, never a visible browser) at the three widths using dev login fixtures.
- Every issue found is fixed, covering the whole class of the problem.
- Scoped check passes once, then hand off.

## Notes for AI
Keep changes small. Never touch repoos.toml. Never open a visible browser. Never print or store real credentials.

## Shots
```json
[
{
"label": "Code step: 44px resend and change-email links, Verify spinner area",
"target": "default",
"route": "/login",
"highlight": ".login-actions",
"state": "auth:otp"
},
{
"label": "Email step: keyboard focus ring on the email input",
"target": "default",
"route": "/login",
"highlight": ".login-input",
"state": "auth:login"
}
]
```

## Activity

- 2026-11-20T07:06:52Z · created · t@t
- 2026-11-20T07:06:57Z · status inbox→ready
- 2026-11-20T07:06:58Z · cli_override, model_override
- 2026-11-20T07:06:59Z · status ready→active, branch
- 2026-11-20T07:40:42Z · message_queued at 2026-11-20T07:40:42.254Z
- 2026-11-20T07:40:42Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-20T07:41:46Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-20T07:43:48Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-20T07:43:48Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 143) · last assistant: The scoped check is still running in the background, and the Monitor will notify me when it exits. Once it does, I'll confirm the result, declare the UI shots, and hand off. · stderr: (empty)
- 2026-11-20T07:43:49Z · message_delivered: 1 message(s)
- 2026-11-20T07:46:52Z · message_queued at 2026-11-20T07:46:52.718Z
- 2026-11-20T07:46:52Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-20T07:46:56Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-20T07:50:03Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-20T07:50:03Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 143) · last assistant: The scoped check is running again from the start, and the Monitor will report when it exits. Once it passes I'll declare the UI shots and hand off. · stderr: (empty)
- 2026-11-20T07:50:04Z · message_delivered: 1 message(s)
- 2026-11-20T07:52:31Z · message_queued at 2026-11-20T07:52:31.506Z
- 2026-11-20T07:52:31Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-20T07:57:31Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-20T08:26:21Z · body
- 2026-11-20T08:26:31Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: I'm not handing off. The scoped `repoos check` fails at the `ui-smoke` step, so the task stays `active` and I have not emitted the handoff signal. **Blocker:** the UI smoke test fails on three console errors, none of them from this diff. T… · stderr: (empty)
- 2026-11-20T08:27:28Z · message_delivered: 1 message(s)
- 2026-11-20T08:27:32Z · message_queued at 2026-11-20T08:27:32.250Z
- 2026-11-20T08:27:32Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-20T08:27:34Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-20T08:43:36Z · body
- 2026-11-20T08:46:47Z · CTO nudge: held — handoff gate is running
- 2026-11-20T09:15:20Z · message_queued at 2026-11-20T09:15:20.449Z
- 2026-11-20T09:17:31Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-20T09:22:46Z · message_queued at 2026-11-20T09:22:46.311Z
- 2026-11-20T09:28:02Z · message_queued at 2026-11-20T09:28:02.492Z
- 2026-11-20T09:31:33Z · message_delivered: 1 message(s)
- 2026-11-20T10:24:17Z · message_overdue: still queued after 60m without being delivered
- 2026-11-20T10:32:33Z · body
- 2026-11-20T10:48:14Z · handoff_deferred: 2 queued message(s) must be read before review
- 2026-11-20T10:48:14Z · message_queued at 2026-11-20T10:48:14.724Z
- 2026-11-20T10:48:17Z · ↻ resuming engineer to read queued message
- 2026-11-20T10:48:17Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The check now exits 0, with all checks passed and no failed steps. Before requesting handoff, I'll add the latest result to the report draft so the record matches the run. · stderr: (empty)
- 2026-11-20T10:53:20Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-11-20T10:53:22Z · note: handoff requested (cli)
- 2026-11-20T10:53:34Z · CTO nudge: held — handoff gate is running
- 2026-11-20T11:07:05Z · message_queued at 2026-11-20T11:07:05.980Z
- 2026-11-20T11:07:06Z · handoff failed · task-file handoff failed at review · Engineering report narrative is 1259 words; the hard limit is 1,200 words of narrative. Shorten it and request handoff again.
- 2026-11-20T11:07:07Z · orphaned run process stopped · pid 82084 · /opt/homebrew/Cellar/bun/1.4.2/bin/bun /Users/nick/code/nick/repoos-worktrees/feat/qa-pass-login-loc · cpu 1s · age 33s
- 2026-11-20T11:08:29Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-20T11:20:49Z · message_delivered: 3 message(s)
- 2026-11-20T11:20:58Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-20T11:20:58Z · message_queued at 2026-11-20T11:20:58.958Z
- 2026-11-20T11:20:59Z · ↻ resuming engineer to read queued message
- 2026-11-20T11:20:59Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The queued messages are recovery notices about the last handoff signal. The work is complete, and the last `repoos check` I ran (exit 0) came after my final code change. I'll confirm the worktree is clean, then emit the signal correctly. · stderr: (empty)
- 2026-11-20T11:57:30Z · message_delivered: 2 message(s)
- 2026-11-20T11:58:33Z · CTO nudge: held — handoff gate is running
- 2026-11-20T12:16:02Z · handoff failed · remote validation failed: test failure: tests/notifications-settings-qa-browser.test.ts > notification and Telegram settings QA (#1249) > at 375px > connects a bot: the token is accepted and never echoed into the page, tests/notifications-settings-qa-browser.test.ts > notification and Telegram settings QA (#1249) > at 768px > connects a bot: the token is accepted and never echoed into the page, tests/notifications-settings-qa-browser.test.ts > notification and Telegram settings QA (#1249) > at 1280px > connects a bot: the token is accepted and never echoed into the page on bee — fix it in the feature branch and re-run the gate
- 2026-11-20T12:16:03Z · message_queued at 2026-11-20T12:16:03.610Z
- 2026-11-20T12:18:33Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-20T12:19:12Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-20T12:24:03Z · message_delivered: 1 message(s)
- 2026-11-20T12:52:16Z · body
- 2026-11-20T12:58:34Z · CTO nudge: held — handoff gate is running
- 2026-11-20T13:26:33Z · note: ui verification passed: 2 of 2 shots captured with clean console
- 2026-11-20T13:26:37Z · status active→review
