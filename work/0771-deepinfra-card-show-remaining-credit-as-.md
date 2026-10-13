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
updated_at: "2026-10-13T22:16:29Z"
last_handoff_failure_fingerprint: "check|remote validation failed: test failure: src/a.test.ts > suite > fails, src/b.test.ts > suite > fails, src/c.test.ts > suite > fails on bee — fix it in the feature branch and re-run the gate"
last_handoff_failure_sha: c48c127993396e8ae7b11782477f97689d202097
dev_error_count: 2
---
## Problem
The DeepInfra provider card shows two money figures that look like they conflict:
- Big number: AVAILABLE CREDIT $9.94
- Small box: SINCE LAST INVOICE $7.13

The DeepInfra billing page shows PREPAID CREDITS $2.81 and MONTHLY USAGE $7.13. The difference between the card's two numbers is $9.94 - $7.13 = $2.81, which is exactly the remaining prepaid credit. So the card is showing a balance that does not match what the user has left. The big number should be the remaining credit.

Also: the card showed 'Usage unavailable: The operation timed out.' while the balance loaded, and its 'As of' timestamp (Oct 13, 11:59 PM) was not clearly marked as stale.

## Desired UX
- Headline (big number): remaining credit (here $2.81), labelled clearly, e.g. 'Remaining credit'.
- Secondary: spend since last invoice ($7.13), with the monthly limit if one is set.
- If the usage call times out, keep the last good figures and mark them as stale with their timestamp, rather than showing a blank or a mismatch.

## Acceptance criteria
- Verify the remaining-credit formula against DeepInfra's own billing API response (the fields behind the billing page's Prepaid Credits), not just the subtraction. Document which field is used.
- Headline shows remaining credit; labels match the DeepInfra billing page names.
- Timeout keeps the last good values, shows a stale marker and time, and does not show an error as the main figure.
- Test: unit test for the formula and the stale/timeout rendering.
- Checked in light and dark themes; contrast audit stays green.

## Notes for AI
Start from the provider card for DeepInfra and its billing fetch on the server (grep DeepInfra billing). Do not hard-code the figures from this screenshot in tests beyond the formula example. Source: user report, 2026-10-14.

## Shots
```json
[
{
"label": "DeepInfra card: Prepaid credits headline with Monthly usage secondary, Stale marker after a timed-out refresh (last good figures kept)",
"target": "default",
"route": "/agents?tab=providers",
"highlight": ".mp-row"
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
