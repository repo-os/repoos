---
id: "0909"
title: "Stop false 'needs human step' flags: sticky overrides, model check before keywords, tagged criteria with auto-split"
type: feature
status: review
priority: p2
area: [core, server, web]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/stop-false-needs-human-step-flags-sticky
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-21T19:41:23Z"
updated_at: "2026-10-22T03:01:00Z"
review_rounds: 1
review_passes: 2
last_check_failure: "repoos check at 2026-10-22T02:27:19.227Z: repoos check failed: ui verification failed (1 issue(s)): [missing-target] Needs-human-step detail shows criterion quote (target \"default\"): highlight .agent-waiting-sub matched nothing on /work?task=0909&tab=overview (http://127.0.0.1:58600/work?shotState=card:humanStep)"
dev_error_count: 3
---
## Problem
The 'needs-human-step' detector flags tasks by keyword (credentials, accounts, device, keys…). 2026-10-22: #0904 (design/implement remote engineer sessions, proven with fakes) was flagged because its criteria merely MENTION credentials; #0904, #0905, #0908 and others were flagged repeatedly and a driver cleared the flag three times, then reworded the task to dodge the scanner. Every edit re-scans and can re-flag, new tasks get flagged on creation, and a flagged task blocks AI dispatch until someone notices. It is brittle and wastes human and driver time.

## Desired UX
A task is flagged only when verifying its acceptance criteria truly requires a human action. A human or driver clearing the flag is remembered and not undone by later edits unless the criteria materially change. When a task genuinely mixes AI-doable and human-only work, RepoOS offers the split instead of just flagging.

## Acceptance criteria
- Sticky override: clearing needs_input (needs-human-step) records a fingerprint of the current acceptance criteria and who cleared it; rescans skip the flag while the fingerprint matches; a material change to the criteria re-evaluates. Tests: clear, edit unrelated section, edit body, change criteria.
- Model check: when the keyword tripwire fires, ask the human-step model check (see model_routing.humanStepCheck in repoos.toml; read how it works first and report whether the keyword scan currently overrides it) whether verification REQUIRES a human, with the matched sentence quoted; the keyword match alone never sets the flag. Record the usage via recordOneShotSession. Tests with fake model answers (requires, merely mentions, ambiguous -> flag with reason).
- Visible reason: the flag detail names the exact sentence and the model's one-line reason; the drawer shows it.
- Tagged criteria: criteria lines may be prefixed [human] or [ai]; only [human] lines can require a human; untagged lines go through the model check. When a task has both tags, a one-click / CLI action (repoos split <id>) creates the held human task (assigned human, depends_on the AI task), moves the [human] lines there and leaves the AI task startable. Tests for the split, including dependency and hold.
- Settings control for the model check and the sticky behaviour, per the Settings-control rule in AGENTS.md; docs updated (user-docs, AGENTS.md human-step paragraph).
- Migration: existing flagged tasks keep working; no frontmatter breakage across work/*.md (parser test).

## Notes for AI
Order of work: sticky override first (smallest, fixes the loop), then the model check, then tags and split. Related: #0908 (human-task board pathway), #0907. Do not weaken the existing safety: a task whose criteria really need a device, account or sign-up must still be flagged.

## Shots
```json
[
{
"label": "Human-step sticky setting on Model routing",
"target": "default",
"route": "/agents?tab=model-routing",
"highlight": "[data-testid=\"routing-human-step-sticky\"]"
},
{
"label": "Needs-human-step banner quotes criterion and model reason",
"target": "default",
"route": "/work?task=9999&tab=overview",
"highlight": ".drawer-critical .agent-waiting-sub",
"steps": [
{
"waitFor": ".drawer-critical .agent-waiting-sub"
}
],
"state": "card:humanStep"
}
]
```

## Activity

- 2026-10-21T19:41:23Z · created · njachowski@gmail.com
- 2026-10-21T19:48:02Z · status inbox→ready
- 2026-10-21T20:03:47Z · cli_override, model_override
- 2026-10-21T20:19:07Z · status ready→active, branch
- 2026-10-21T20:34:56Z · message_queued at 2026-10-21T20:34:56.324Z
- 2026-10-21T20:34:56Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-21T20:52:35Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-21T23:51:06Z · engineer stopped by request
- 2026-10-21T23:51:27Z · status active→ready
- 2026-10-21T23:51:37Z · status ready→active
- 2026-10-21T23:51:38Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T23:51:39Z · message_delivered: 1 message(s)
- 2026-10-22T00:07:15Z · message_queued at 2026-10-22T00:07:15.281Z
- 2026-10-22T00:07:15Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-22T00:19:46Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-22T01:09:22Z · message_overdue: still queued after 60m without being delivered
- 2026-10-22T01:10:04Z · engineer stopped by request
- 2026-10-22T01:11:06Z · status active→ready
- 2026-10-22T01:11:11Z · status ready→active
- 2026-10-22T01:11:12Z · message_delivered: 1 message(s)
- 2026-10-22T01:15:11Z · agent exited with an error (opencode) · error: Go usage limit exceeded
- 2026-10-22T01:15:11Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4.1-flash (1/3 crashes in 30m) · error: Go usage limit exceeded
- 2026-10-22T01:15:12Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4.1-flash (2/3 crashes in 30m) · error: Go usage limit exceeded
- 2026-10-22T01:15:14Z · engineer crash recovery: surfaced instead of switching — a human-set task override (opencode + opencode-go/deepseek-v4.1-flash) is pinned, so RepoOS did not replace it (3/3 crashes in 30m)
- 2026-10-22T01:16:47Z · cli_override, model_override
- 2026-10-22T01:16:48Z · needs_input
- 2026-10-22T01:17:01Z · status active→ready
- 2026-10-22T01:17:05Z · status ready→active
- 2026-10-22T01:24:09Z · body
- 2026-10-22T01:24:09Z · body
- 2026-10-22T01:25:59Z · body
- 2026-10-22T01:26:00Z · body
- 2026-10-22T01:32:33Z · message_queued at 2026-10-22T01:32:33.711Z
- 2026-10-22T01:32:33Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-22T01:34:02Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-22T01:39:26Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-22T01:40:08Z · body
- 2026-10-22T01:42:58Z · body
- 2026-10-22T01:42:59Z · body
- 2026-10-22T01:43:59Z · body
- 2026-10-22T01:44:26Z · CTO nudge: held — handoff gate is running
- 2026-10-22T02:01:28Z · handoff failed · remote validation failed: test failure: tests/model-routing-panel.test.ts > ModelRoutingPanel > labels the human-step check as mixed AI and human steps that should be split on mini — fix it in the feature branch and re-run the gate
- 2026-10-22T02:01:28Z · handoff failed · handoff recovery attempted · finalization failed
- 2026-10-22T02:06:43Z · watchdog: auto-surfaced stuck task · status active→review · handoff recovery was attempted after an interrupted turn but finalization failed — manual intervention needed · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-10-22T02:06:43Z · note: handoff requested (cli)
- 2026-10-22T02:12:35Z · assigned_to
- 2026-10-22T02:13:48Z · assigned_to
- 2026-10-22T02:13:49Z · note: handoff requested (ui-review)
- 2026-10-22T02:23:20Z · note: ui verification failed (1 issue(s)): [missing-target] Needs-human-step detail shows criterion quote (target "default"): highlight .agent-waiting-sub matched nothing on /work?task=0909&tab=overview (http://127.0.0.1:57885/work?shotState=card:humanStep)
- 2026-10-22T02:23:20Z · handoff failed · ui-review handoff failed at verify · ui verification failed (1 issue(s)): [missing-target] Needs-human-step detail shows criterion quote (target "default"): highlight .agent-waiting-sub matched nothing on /work?task=0909&tab=overview (http://127.0.0.1:57885/work?shotState=card:humanStep)
- 2026-10-22T02:23:20Z · message_delivered: 1 message(s)
- 2026-10-22T02:24:57Z · body
- 2026-10-22T02:24:57Z · body
- 2026-10-22T02:27:16Z · note: ui verification failed (1 issue(s)): [missing-target] Needs-human-step detail shows criterion quote (target "default"): highlight .agent-waiting-sub matched nothing on /work?task=0909&tab=overview (http://127.0.0.1:58600/work?shotState=card:humanStep)
- 2026-10-22T02:28:19Z · body
- 2026-10-22T02:30:02Z · body
- 2026-10-22T02:30:02Z · body
- 2026-10-22T02:33:55Z · body
- 2026-10-22T02:33:55Z · body
- 2026-10-22T02:44:26Z · status active→review
- 2026-10-22T02:44:26Z · note: shots: skipped — 2 handoff shots already captured for this exact plan (ccfe06c26) during finalization (#0734)
- 2026-10-22T02:44:26Z · note: shots: skipped — 2 handoff shots already captured for this exact plan (ccfe06c26) during finalization (#0734)
- 2026-10-22T02:45:32Z · note: review pass 1: needs some work
- 2026-10-22T02:47:00Z · note: review pass 2: needs some work
- 2026-10-22T02:47:01Z · status review→active
- 2026-10-22T02:48:02Z · body
- 2026-10-22T02:49:55Z · body
- 2026-10-22T02:49:55Z · body
- 2026-10-22T02:51:20Z · note: handoff requested (ui-review)
- 2026-10-22T02:53:21Z · CTO nudge: held — handoff gate is running
- 2026-10-22T03:00:59Z · status active→review
- 2026-10-22T03:00:59Z · note: shots: skipped — 2 handoff shots already captured for this exact plan (af25ab93d) during finalization (#0734)
- 2026-10-22T03:01:00Z · note: shots: skipped — 2 handoff shots already captured for this exact plan (af25ab93d) during finalization (#0734)
