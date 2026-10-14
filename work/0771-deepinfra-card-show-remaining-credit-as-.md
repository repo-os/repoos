---
id: "0771"
title: "DeepInfra card: show remaining credit as the headline number"
type: bug
status: active
priority: p2
area: [web, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/deepinfra-card-show-remaining-credit-as-
cli_override: claude code
model_override: haiku
review_cli_override: github copilot
review_model_override: default
created_at: "2026-10-13T17:02:59Z"
updated_at: "2026-10-14T00:03:13Z"
review_passes: 7
last_check_failure: "repoos check at 2026-10-13T23:22:53.274Z: repoos check failed: ◆ Check plan"
review_rounds: 2
dev_error_count: 2
---
## Problem
The DeepInfra provider card shows two money figures that look like they conflict:
- Big number: AVAILABLE CREDIT $9.94
- Small box: SINCE LAST INVOICE $7.13

The DeepInfra billing page shows PREPAID CREDITS $2.81 and MONTHLY USAGE $7.13. The difference between the card's two numbers is $9.94 - $7.13 = $2.81, which is exactly the remaining prepaid credit. So the card is showing a balance that does not match what the user has left. The big number should be the remaining credit.

Also: the card showed 'Usage unavailable: The operation timed out.' while the balance loaded, and its 'As of' timestamp (Oct 13, 11:59 PM) was not clearly marked as stale.

## Formula Verification
The remaining prepaid credit is calculated from DeepInfra's `/payment/checklist` endpoint response:
- `stripe_balance`: negative value indicating funds ready-to-spend (e.g., -9.94)
- `recent`: usage since most recent invoice (e.g., 7.13)
- **Remaining prepaid credit = max(0, -stripe_balance - recent) = max(0, 9.94 - 7.13) = 2.81**

Test `parseDeepInfraChecklist` verifies this formula against the exact example from the problem statement (src/ui-app/tests/model-provider-spend.test.ts:96-99).

## Desired UX
- Headline (big number): remaining credit (here $2.81), labelled clearly, e.g. 'Prepaid credits'.
- Secondary: spend since last invoice ($7.13), with the monthly limit if one is set.
- If the usage call times out, keep the last good figures and mark them as stale with their timestamp, rather than showing a blank or a mismatch.

## Acceptance criteria
- Verify the remaining-credit formula against DeepInfra's own billing API response (the fields behind the billing page's Prepaid Credits), not just the subtraction. Document which field is used. ✓
- Headline shows remaining credit; labels match the DeepInfra billing page names. ✓
- Timeout keeps the last good values, shows a stale marker and time, and does not show an error as the main figure. ✓
- Test: unit test for the formula and the stale/timeout rendering. ✓
- Checked in light and dark themes; contrast audit stays green. ✓

## Notes for AI
Start from the provider card for DeepInfra and its billing fetch on the server (grep DeepInfra billing). Do not hard-code the figures from this screenshot in tests beyond the formula example. Source: user report, 2026-10-14.

## Shots
```json
[
{
"label": "DeepInfra card: Remaining prepaid credits as headline, monthly usage secondary (light theme)",
"target": "default",
"route": "/agents?tab=providers",
"selector": "[data-provider-id=\"deepinfra\"]",
"highlight": ".mp-stat-hero",
"steps": [
  {
    "waitFor": "[data-provider-id=\"deepinfra\"] .mp-stat-hero .mp-stat-value"
  }
]
},
{
"label": "DeepInfra card: Remaining prepaid credits as headline, monthly usage secondary (dark theme)",
"target": "default",
"route": "/agents?tab=providers",
"selector": "[data-provider-id=\"deepinfra\"]",
"highlight": ".mp-stat-hero",
"steps": [
  {
    "click": ".theme-toggle"
  },
  {
    "waitFor": "[data-provider-id=\"deepinfra\"] .mp-stat-hero .mp-stat-value"
  }
]
}
]
```

## Activity

- 2026-10-13T17:02:59Z · created · njachowski@gmail.com
- 2026-10-13T17:22:16Z · status inbox→ready
- 2026-10-13T17:22:22Z · cli_override, model_override
- 2026-10-13T17:22:24Z · model_override
- 2026-10-13T17:22:29Z · review_cli_override, review_model_override
- 2026-10-13T17:22:31Z · status ready→active, branch
- 2026-10-13T17:27:39Z · message_queued at 2026-10-13T17:27:38.944Z
- 2026-10-13T17:27:39Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-13T17:45:24Z · body: section Shots
- 2026-10-13T17:46:13Z · body
- 2026-10-13T17:52:46Z · handoff failed · remote validation failed: test failure: src/a.test.ts > suite > fails, src/b.test.ts > suite > fails, src/c.test.ts > suite > fails on thinkpad — fix it in the feature branch and re-run the gate
- 2026-10-13T17:58:06Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: test failure: src/a.test.ts > suite > fails, src/b.test.ts > suite > fails, src/c.test.ts > suite > fails on thinkpad — fix it in the feature branch and re-run the gate · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-13T17:58:06Z · note: handoff requested (cli)
- 2026-10-13T18:03:46Z · handoff failed · task-file handoff failed at check · remote validation failed: test failure: src/a.test.ts > suite > fails, src/b.test.ts > suite > fails, src/c.test.ts > suite > fails on bee — fix it in the feature branch and re-run the gate
- 2026-10-13T18:09:40Z · cli_override, model_override
- 2026-10-13T18:09:42Z · model_override
- 2026-10-13T18:10:09Z · message_delivered: 1 message(s)
- 2026-10-13T18:14:48Z · body
- 2026-10-13T18:16:11Z · agent exited with an error (opencode) · error: Transport
- 2026-10-13T18:37:59Z · body
- 2026-10-13T18:44:27Z · handoff failed · remote validation failed: test failure: src/a.test.ts > suite > fails, src/b.test.ts > suite > fails, src/c.test.ts > suite > fails on bee — fix it in the feature branch and re-run the gate
- 2026-10-13T19:05:18Z · cli_override, model_override
- 2026-10-13T19:05:31Z · needs_input
- 2026-10-13T19:05:50Z · agent exited with an error (claude) · ✗ Server finalization stopped at check: remote validation failed: test failure: src/a.test.ts > suite > fails, src/b.test.ts > suite > fails, src/c.test.ts > suite > fails on bee — fix it in the feature branch and re-run the gate. The same worktree can be resumed and retried.
- 2026-10-13T19:06:51Z · cli_override, model_override
- 2026-10-13T19:10:17Z · body
- 2026-10-13T19:12:24Z · body
- 2026-10-13T19:19:51Z · handoff failed · remote validation failed: test failure: src/a.test.ts > suite > fails, src/b.test.ts > suite > fails, src/c.test.ts > suite > fails on thinkpad — fix it in the feature branch and re-run the gate
- 2026-10-13T19:57:50Z · body
- 2026-10-13T20:08:20Z · note: Resumed session: implemented and verified the remaining-credit card (formula documented from DeepInfra's own OpenAPI spec: no dedicated prepaid-credits field; derived as max(0, -stripe_balance - recent), stripe_balance<0, converted from cents for scoped credits). Also fixed the gate phantom that failed every prior handoff: check-runner.test.ts's scripted fixture echoes fake 'FAIL src/a.test.ts' lines into the gate stdout (runCommand echo defaults true), and the remote validator's extractFailedTests picked them up as the failed-test headline, masking real failures. runCheckPlan now takes echo:false (tests-step child output stays parsed, just not echoed) and fixture tests pass it, with a regression test. Scoped check green incl. remote changed-path run on bee. --json
- 2026-10-13T20:08:40Z · body: section Shots
- 2026-10-13T21:57:10Z · needs_input
- 2026-10-13T21:59:54Z · body
- 2026-10-13T22:01:00Z · body
- 2026-10-13T22:01:47Z · message_queued at 2026-10-13T22:01:47.689Z
- 2026-10-13T22:02:20Z · body
- 2026-10-13T22:16:28Z · cli_override, model_override
- 2026-10-13T22:16:30Z · message_delivered: 1 message(s)
- 2026-10-13T22:17:13Z · message_queued at 2026-10-13T22:17:13.951Z
- 2026-10-13T22:19:00Z · body
- 2026-10-13T22:26:02Z · handoff failed · remote validation failed: test failure: tests/model-providers-routes.test.ts > DeepInfra usage routes (#0625) and the reverted Copilot row (#0629) > returns parsed DeepInfra spend with cents converted to dollars on bee — fix it in the feature branch and re-run the gate
- 2026-10-13T22:30:17Z · message_delivered: 1 message(s)
- 2026-10-13T22:30:57Z · message_queued at 2026-10-13T22:30:57.911Z
- 2026-10-13T22:32:12Z · body
- 2026-10-13T22:39:15Z · handoff failed · remote validation failed: test failure: tests/model-providers-routes.test.ts > DeepInfra usage routes (#0625) and the reverted Copilot row (#0629) > returns parsed DeepInfra spend with cents converted to dollars on bee — fix it in the feature branch and re-run the gate
- 2026-10-13T22:39:55Z · message_delivered: 1 message(s)
- 2026-10-13T22:41:12Z · body
- 2026-10-13T22:43:03Z · body
- 2026-10-13T22:50:19Z · status active→review
- 2026-10-13T22:51:41Z · note: review pass 1: needs some work
- 2026-10-13T22:51:41Z · status review→active
- 2026-10-13T22:54:17Z · body: section Shots
- 2026-10-13T22:55:03Z · body
- 2026-10-13T22:55:40Z · status active→review
- 2026-10-13T22:57:19Z · note: review pass 2: needs some work
- 2026-10-13T22:57:19Z · message_queued at 2026-10-13T22:57:19.937Z
- 2026-10-13T22:57:20Z · status review→active
- 2026-10-13T22:58:48Z · message_queued at 2026-10-13T22:58:48.770Z
- 2026-10-13T23:01:53Z · status active→review
- 2026-10-13T23:01:53Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (8f9bf5c71) during finalization (#0734)
- 2026-10-13T23:01:54Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (8f9bf5c71) during finalization (#0734)
- 2026-10-13T23:03:13Z · note: review pass 3: needs some work
- 2026-10-13T23:03:13Z · needs_input
- 2026-10-13T23:03:38Z · status review→active
- 2026-10-13T23:03:49Z · needs_input
- 2026-10-13T23:03:49Z · message_delivered: 2 message(s)
- 2026-10-13T23:04:15Z · body
- 2026-10-13T23:04:23Z · body: section Shots
- 2026-10-13T23:05:08Z · body
- 2026-10-13T23:05:48Z · status active→review
- 2026-10-13T23:22:50Z · note: review pass 4: failed — no usable report
- 2026-10-13T23:22:50Z · needs_input
- 2026-10-13T23:22:56Z · note: waitFor .mp-row:nth-of-type(5) .mp-stat-value: waitFor: Timeout 5000ms exceeded. on /agents?tab=providers
- 2026-10-13T23:23:03Z · status review→active
- 2026-10-13T23:23:07Z · needs_input
- 2026-10-13T23:23:48Z · message_queued at 2026-10-13T23:23:48.956Z
- 2026-10-13T23:24:47Z · body
- 2026-10-13T23:28:26Z · body
- 2026-10-13T23:29:05Z · status active→review
- 2026-10-13T23:29:06Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (8f9bf5c71) during finalization (#0734)
- 2026-10-13T23:30:14Z · note: review pass 5: needs some work
- 2026-10-13T23:30:15Z · needs_input
- 2026-10-13T23:32:49Z · status review→active
- 2026-10-13T23:33:01Z · needs_input
- 2026-10-13T23:33:01Z · message_delivered: 1 message(s)
- 2026-10-13T23:33:46Z · body: section Shots
- 2026-10-13T23:35:08Z · body
- 2026-10-13T23:36:57Z · body
- 2026-10-13T23:38:24Z · body: section Shots
- 2026-10-13T23:39:11Z · body
- 2026-10-13T23:40:00Z · status active→review
- 2026-10-13T23:41:56Z · note: review pass 6: needs some work
- 2026-10-13T23:41:56Z · needs_input
- 2026-10-13T23:46:47Z · status review→active
- 2026-10-13T23:47:01Z · needs_input
- 2026-10-13T23:48:20Z · body
- 2026-10-13T23:50:25Z · body
- 2026-10-13T23:51:03Z · status active→review
- 2026-10-13T23:52:40Z · note: review pass 7: needs some work
- 2026-10-13T23:52:41Z · needs_input
- 2026-10-13T23:56:17Z · status review→active
- 2026-10-13T23:56:27Z · needs_input
- 2026-10-13T23:56:28Z · message_queued at 2026-10-13T23:56:28.149Z
- 2026-10-13T23:57:41Z · status active→review
- 2026-10-13T23:57:41Z · note: shots: skipped — 2 handoff shots already captured for this exact plan (2c16453c5) during finalization (#0734)
- 2026-10-13T23:57:41Z · note: shots: skipped — 2 handoff shots already captured for this exact plan (2c16453c5) during finalization (#0734)
- 2026-10-13T23:58:56Z · note: review pass 8: needs some work
- 2026-10-13T23:58:56Z · needs_input
- 2026-10-14T00:01:05Z · status review→active
- 2026-10-14T00:01:16Z · needs_input
- 2026-10-14T00:01:16Z · message_delivered: 1 message(s)
- 2026-10-14T00:02:05Z · body: section Shots
- 2026-10-14T00:03:13Z · body
