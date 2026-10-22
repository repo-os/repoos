---
id: "0924"
title: "Checks page: show % complete for a running check (steps and test files)"
type: feature
status: active
priority: p2
area: [web, core]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/checks-page-show-complete-for-a-running-
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-22T06:08:54Z"
updated_at: "2026-10-22T15:37:37Z"
review_rounds: 1
review_passes: 2
handoff_signal_retry_count: 1
dev_error_count: 2
engineer_crash_log: "[{\"cli\":\"codex\",\"model\":\"gpt-6-luna\",\"at\":\"2026-10-22T15:32:09.477Z\",\"kind\":\"dev-error\"}]"
---
## Problem
A running check (engineer self-check, handoff, close-out) shows only elapsed time and a log tail. Nick cannot tell whether a 40-minute run is 10% or 90% done, or whether it is looping (incident 2026-10-22, #0909: the test step timed out at 420s twice and restarted, invisible from the UI).

## Desired UX
On the Checks page, the task drawer's check banner and the close-out button: a progress bar with 'step 5 of 12 · tests 140/289 files · 4m10s'. Step progress comes from the check plan (steps done / total, skipped steps excluded). Inside the tests step, file progress comes from the vitest run: total file count from a one-time list at start, completed count from the reporter (the run-tests.mjs wrapper emits a machine-readable progress line per finished file). Show 'attempt 2' and the reason when a step restarts after a timeout. If total is unknown, show steps only; never show a fake percentage.

## Acceptance criteria
- Check runs persist steps_done/steps_total and tests_done/tests_total (checks.db migration, nullable).
- The UI shows the bar and updates live (SSE) for local and remote runs.
- A restarted step visibly resets and shows its attempt number.
- Tests cover the progress line parsing and the bar with unknown totals.

## Notes for AI
Do not change the check plan or step semantics; this is reporting only. Related: #0921 (slot visibility), #0917 (upload progress).

## Queue wording
Shorten the local-slot queue message. The banner already says 'queued', so 'waiting for a local check slot (2 ahead, position 3)' repeats itself. Show just 'queued #3' (position in line; 'queued' alone when first) in src/core/local-gates.ts (~line 142) and src/ui-app/src/lib/local-queue-hint.ts, with the full sentence only in the hover/tooltip. Update the tests that assert the old text. (Nick, 2026-10-22)

## Shots
```json
[
{
"label": "Running close-out progress with test files and retry attempt",
"target": "default",
"route": "/work?task=9999&tab=overview",
"highlight": "[data-test-id=\"close-out-check-progress\"]",
"state": "closeOut:checkProgress"
},
{
"label": "Running close-out progress with unknown test totals",
"target": "default",
"route": "/work?task=9999&tab=overview",
"highlight": "[data-test-id=\"close-out-check-progress\"]",
"state": "closeOut:checkProgressUnknown"
},
{
"label": "Checks page with a running test-step progress bar",
"target": "default",
"route": "/checks?tab=now",
"highlight": "[data-test-id=\"checks-page-progress\"]",
"state": "checks:progress"
}
]
```

## Activity

- 2026-10-22T06:08:54Z · created · njachowski@gmail.com
- 2026-10-22T07:11:55Z · body: Queue wording (added)
- 2026-10-22T14:03:21Z · status inbox→ready
- 2026-10-22T14:03:27Z · cli_override, model_override
- 2026-10-22T14:03:27Z · status ready→active, branch
- 2026-10-22T14:06:51Z · body
- 2026-10-22T14:08:29Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-22T14:17:03Z · message_queued at 2026-10-22T14:17:03.349Z
- 2026-10-22T14:17:03Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-22T14:17:25Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-22T14:17:32Z · body
- 2026-10-22T14:20:03Z · body
- 2026-10-22T14:22:42Z · body
- 2026-10-22T14:28:14Z · body
- 2026-10-22T14:30:21Z · body
- 2026-10-22T14:38:33Z · body
- 2026-10-22T14:39:11Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-10-22T14:39:11Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-22T14:39:11Z · message_delivered: 1 message(s)
- 2026-10-22T14:49:25Z · note: ui verification passed: 1 shot captured with clean console
- 2026-10-22T14:49:26Z · status active→review
- 2026-10-22T14:52:39Z · note: review pass 1: needs some work
- 2026-10-22T14:53:30Z · status review→active
- 2026-10-22T14:53:51Z · CTO nudge: held — remote validation is running
- 2026-10-22T14:54:26Z · note: ui verification passed: 1 shot captured with clean console
- 2026-10-22T14:58:47Z · body
- 2026-10-22T15:07:16Z · body
- 2026-10-22T15:10:29Z · body
- 2026-10-22T15:14:28Z · note: state "closeOut:checkProgress" did not render on target "default" — /checks?tab=now shows no task card
- 2026-10-22T15:15:04Z · body
- 2026-10-22T15:19:33Z · body
- 2026-10-22T15:21:08Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-22T15:21:08Z · status active→review
- 2026-10-22T15:21:09Z · note: handoff requested (cli)
- 2026-10-22T15:30:31Z · status active→review
- 2026-10-22T15:30:32Z · note: shots: skipped — 9 shots already captured — an engineer-made capture pre-empts the automatic one
- 2026-10-22T15:32:04Z · note: review pass 2: needs some work
- 2026-10-22T15:32:05Z · status review→active
- 2026-10-22T15:32:09Z · agent exited with an error (codex) · error: You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purchase more credits or try again at Oct 23rd, 2026 12:17 AM.
- 2026-10-22T15:32:09Z · engineer crash recovery: resuming codex + gpt-6-luna (1/3 crashes in 30m) · error: You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purchase more credits or try again at Oct 23rd, 2026 12:17 AM.
- 2026-10-22T15:32:53Z · needs_input
- 2026-10-22T15:32:54Z · cli_override, model_override
- 2026-10-22T15:37:37Z · body
