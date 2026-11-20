---
id: "1263"
title: "QA pass: Settings general, agents and budget tabs"
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-settings-general-agents-and-budg
cli_override: claude code
model_override: haiku
created_at: "2026-11-20T02:27:07Z"
updated_at: "2026-11-20T07:18:32Z"
review_passes: 3
review_rounds: 2
---
## Problem
Sweep the Settings general, agents and budget tabs for layout, wording, save and validation bugs.

## Desired UX
Pages look and behave correctly at 375, 768 and 1280 widths: no overflow, clear labels, sensible empty, loading and error states, visible keyboard focus.

## Acceptance criteria
- Walked headlessly (Playwright only, never a visible browser) at the three widths.
- Every issue found is fixed, covering the whole class of the problem.
- Scoped check passes once, then hand off.

## Notes for AI
Keep changes small. Never touch repoos.toml. Never open a visible browser.

## Shots
```json
[
{
"label": "Settings General with every setting control named",
"target": "default",
"route": "/settings?tab=general"
},
{
"label": "Agents Budget Controls tab with named controls",
"target": "default",
"route": "/agents?tab=budget-controls"
}
]
```

## Activity

- 2026-11-20T02:27:07Z · created · t@t
- 2026-11-20T02:27:12Z · status inbox→ready
- 2026-11-20T02:27:14Z · cli_override, model_override
- 2026-11-20T02:27:15Z · status ready→active, branch
- 2026-11-20T02:49:36Z · body
- 2026-11-20T02:58:45Z · body
- 2026-11-20T03:02:13Z · CTO nudge: held — handoff gate is running
- 2026-11-20T03:05:56Z · note: ui verification passed: 1 shot captured with clean console
- 2026-11-20T03:05:58Z · status active→review
- 2026-11-20T03:05:58Z · message_queued at 2026-11-20T03:05:58.392Z
- 2026-11-20T03:09:24Z · note: review pass 1: needs some work
- 2026-11-20T03:09:30Z · status review→active
- 2026-11-20T03:09:37Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-20T03:12:07Z · message_delivered: 1 message(s)
- 2026-11-20T03:22:32Z · body
- 2026-11-20T03:27:15Z · body
- 2026-11-20T03:32:01Z · CTO nudge: held — handoff gate is running
- 2026-11-20T03:36:05Z · note: ui verification passed: 2 of 2 shots captured with clean console
- 2026-11-20T03:36:07Z · status active→review
- 2026-11-20T03:36:07Z · message_queued at 2026-11-20T03:36:07.561Z
- 2026-11-20T03:38:19Z · note: review pass 2: needs some work
- 2026-11-20T03:38:20Z · status review→active
- 2026-11-20T03:38:23Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-20T03:38:28Z · message_delivered: 1 message(s)
- 2026-11-20T03:52:15Z · message_queued at 2026-11-20T03:52:15.041Z
- 2026-11-20T03:52:16Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-20T03:54:48Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-20T03:55:18Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-20T03:55:20Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 143) · last assistant: The round-3 scoped check is running, and I've left the tree alone while it runs. I'll report its result when it finishes. · stderr: (empty)
- 2026-11-20T03:55:22Z · message_delivered: 1 message(s)
- 2026-11-20T03:55:28Z · body
- 2026-11-20T03:57:14Z · message_queued at 2026-11-20T03:57:14.888Z
- 2026-11-20T03:57:15Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-20T04:00:50Z · queued message undelivered for 4m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-20T04:00:51Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 143) · last assistant: The round-3 check is still running, at its final `ui-smoke` step. I'm waiting on its exit line and will hand off only if it passes. · stderr: (empty)
- 2026-11-20T04:00:55Z · note: handoff requested (cli)
- 2026-11-20T04:02:14Z · CTO nudge: held — handoff gate is running
- 2026-11-20T04:02:44Z · message_delivered: 1 message(s)
- 2026-11-20T04:03:19Z · status active→review
- 2026-11-20T04:13:42Z · note: ui verification failed (2 issue(s)): [missing-target] Settings General with every setting control named (target "default"): loading state detected: loading indicator [aria-busy="true"] on /settings?tab=general (http://127.0.0.1:63011/settings?tab=general); [missing-target] Agents Budget Controls tab with named controls (target "default"): loading state detected: loading indicator [aria-busy="true"] on /agents?tab=budget-controls (http://127.0.0.1:63011/agents?tab=budget-controls)
- 2026-11-20T04:13:43Z · handoff failed · task-file handoff failed at verify · ui verification failed (2 issue(s)): [missing-target] Settings General with every setting control named (target "default"): loading state detected: loading indicator [aria-busy="true"] on /settings?tab=general (http://127.0.0.1:63011/settings?tab=general); [missing-target] Agents Budget Controls tab with named controls (target "default"): loading state detected: loading indicator [aria-busy="true"] on /agents?tab=budget-controls (http://127.0.0.1:63011/agents?tab=budget-controls)
- 2026-11-20T04:13:45Z · note: review pass 3: good to go
- 2026-11-20T04:13:57Z · orphaned run process stopped · pid 61702 · /opt/homebrew/Cellar/bun/1.4.2/bin/bun /Users/nick/code/nick/repoos-worktrees/feat/qa-pass-settings- · cpu 1s · age 42s
- 2026-11-20T04:29:40Z · handoff failed · remote validation failed: test failure: tests/settings-agents-budget-qa-browser.test.ts > Settings General, Agents and Budget Controls QA (#1263) > Agents → Model routing at 1280px: no overflow, named controls, visible focus on bee — fix it in the feature branch and re-run the gate
- 2026-11-20T04:29:42Z · message_queued at 2026-11-20T04:29:42.757Z
- 2026-11-20T05:42:27Z · message_overdue: still queued after 60m without being delivered
- 2026-11-20T06:46:30Z · status review→active
- 2026-11-20T06:46:34Z · message_delivered: 1 message(s)
- 2026-11-20T06:46:35Z · message_queued at 2026-11-20T06:46:35.398Z
- 2026-11-20T06:46:48Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-20T07:10:47Z · queued message undelivered for 24m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-20T07:10:48Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 143) · last assistant: The re-run is in progress. I'll wait for its completion notification before deciding anything about the `WebKit internal error`. · stderr: (empty)
- 2026-11-20T07:10:48Z · status active→review
- 2026-11-20T07:10:48Z · message_delivered: 1 message(s)
- 2026-11-20T07:10:49Z · note: handoff requested (cli)
- 2026-11-20T07:12:31Z · CTO nudge: held — handoff gate is running
- 2026-11-20T07:18:32Z · status active→review
