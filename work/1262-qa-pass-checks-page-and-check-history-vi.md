---
id: "1262"
title: "QA pass: Checks page and check history views"
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-checks-page-and-check-history-vi
cli_override: claude code
model_override: haiku
created_at: "2026-11-20T02:26:53Z"
updated_at: "2026-11-20T04:24:06Z"
review_rounds: 1
review_passes: 1
handoff_signal_retry_count: 2
last_check_failure: "repoos check at 2026-11-20T03:19:36.092Z: repoos check failed: reused check inputs changed during handoff — run the check again"
---
## Problem
Sweep the Checks page (local and remote tabs, history, failure details) for layout, wording and state bugs.

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
"label": "Check plan at phone width: long step names and commands wrap or scroll inside their cards",
"target": "default",
"route": "/checks?tab=plan",
"highlight": ".ck-steps",
"state": "checks:longData"
},
{
"label": "Now tab: local slots and close-out pipeline share one divider and label style",
"target": "default",
"route": "/checks?tab=now",
"highlight": ".ips-local-slots",
"state": "checks:progress"
}
]
```

## Activity

- 2026-11-20T02:26:53Z · created · t@t
- 2026-11-20T02:26:58Z · status inbox→ready
- 2026-11-20T02:26:59Z · cli_override, model_override
- 2026-11-20T02:27:01Z · status ready→active, branch
- 2026-11-20T02:43:33Z · body
- 2026-11-20T02:45:32Z · body
- 2026-11-20T02:46:57Z · CTO nudge: held — handoff gate is running
- 2026-11-20T02:48:38Z · message_queued at 2026-11-20T02:48:38.576Z
- 2026-11-20T02:48:41Z · message_delivered: 1 message(s)
- 2026-11-20T02:58:38Z · body
- 2026-11-20T03:06:14Z · body
- 2026-11-20T03:12:15Z · CTO nudge: held — handoff gate is running
- 2026-11-20T03:19:32Z · message_queued at 2026-11-20T03:19:32.924Z
- 2026-11-20T03:22:14Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-20T03:27:24Z · message_queued at 2026-11-20T03:27:24.165Z
- 2026-11-20T03:28:33Z · message_delivered: 1 message(s)
- 2026-11-20T03:31:20Z · queued message undelivered for 4m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-20T03:31:21Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 143) · last assistant: The merge is in and the rebuild passed. The fresh scoped check is running in the background, queued behind the pressure guard if needed. I'll request handoff only after it passes. **Status:** The handoff failed twice with "reused check inp… · stderr: (empty)
- 2026-11-20T03:31:21Z · message_delivered: 1 message(s)
- 2026-11-20T03:37:41Z · body
- 2026-11-20T03:43:32Z · body
- 2026-11-20T03:51:09Z · body
- 2026-11-20T03:52:53Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The scoped check failed again, and this time on a different Settings element. The rendered-contrast audit has now failed on two different Settings descriptions across three runs and passed on one re-run, with nothing changed in between. My… · stderr: (empty)
- 2026-11-20T04:02:31Z · body
- 2026-11-20T04:08:19Z · CTO nudge: held — handoff gate is running
- 2026-11-20T04:16:19Z · status active→review
- 2026-11-20T04:16:20Z · message_queued at 2026-11-20T04:16:20.254Z
- 2026-11-20T04:16:26Z · orphaned run process stopped · pid 70143 · /opt/homebrew/Cellar/bun/1.4.2/bin/bun /Users/nick/code/nick/repoos-worktrees/feat/qa-pass-checks-pa · cpu 1s · age 47s
- 2026-11-20T04:18:46Z · note: review pass 1: needs some work
- 2026-11-20T04:18:48Z · status review→active
- 2026-11-20T04:18:52Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-20T04:24:01Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-11-20T04:24:06Z · note: handoff requested (cli)
