---
id: "0993"
title: Auto-recover tasks that are active with no live engineer
type: bug
status: done
priority: p1
area: server
merged_commit: f134266a1d533dd2de38bd63e5d3f59fa903b427
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/auto-recover-tasks-that-are-active-with-
cli_override: cursor
model_override: grok-4.7-low
created_at: "2026-10-31T10:08:41Z"
updated_at: "2026-11-01T09:45:05Z"
last_close_out_gate_ms: 764324
last_close_out_gate_at: "2026-11-01T09:45:05.747Z"
review_passes: 1
---
## Problem

On 2026-10-31 two tasks (#0964, #0986) sat `active` for about 13 hours with no engineer running, and nothing noticed. Both showed "needs input: dev error" (the agent exited with an error). #0964's Codex engineer crashed on a network error and the auto-resume targeted Codex, which was paused. #0986's automatic resume failed with "This worktree already has a recorded live engineer for task #0986 (pid ...)" for a process that no longer existed. Both were parked as waiting-on-a-human, which the watchdog and CTO monitor skip by design. Meanwhile the two-engineer cap was held by these dead tasks, so three ready tasks could not start.

## Desired UX

A task that is active with no live engineer is recovered automatically, or the human is told promptly, instead of silently holding a slot.

## Acceptance criteria

- [ ] An active, non-held task with no live engineer process for more than a configurable window (default about 10 minutes) is restarted on the next allowlisted, non-paused agent pair.
- [ ] A resume refused because of a recorded live engineer whose pid is gone clears the dead record and retries once.
- [ ] A crash recovery that picked a paused agent or model fails over to an allowed pair immediately, instead of retrying the paused one.
- [ ] If automatic recovery fails, the human gets a notification (notices bell, and the push channel when configured) naming the task and the reason, and the failure is recorded in the task activity.
- [ ] Dead tasks no longer count toward the engineer cap.
- [ ] The window is a Settings control with copy and a test (AGENTS.md), and a test covers each case above with a fake runner.

## Notes for AI

Start from `src/server/task-watchdog.ts` and `src/server/engineer-crash-recovery.ts`. Never recover a held task (`isHoldActive`) or a human-assigned one. Respect the budget allowlist and paused pairs; do not work around a refusal. Never override a human-set override.

## Also: stale state on done tasks
Seen on #0970 (done, branch merged to main): an engineer session that outlived the move to done crashed later, set needs_input dev-error, and the badge stayed on a done task. A queued message to that session was never delivered, and the log shows a message_overdue entry every few hours. Acceptance: (1) moving a task to done clears needs_input, its reason and detail, and the debug tl;dr; (2) queued messages for a done task are dropped, with one activity line saying so, instead of re-warning forever; (3) an engineer crash on a task that is already done does not set needs_input; (4) a test covers each. Also related: the board status label can read 'Waiting on a human: dev error' after an engineer was restarted (seen on #0964); the label must follow the live state.

## Also: holds on done tasks
The board's Held list shows done tasks (seen: #0899 and #0849, both status done with a bare hold: true and no reason, owner or time, so the hold predates the structured hold fields). A hold on a done task controls nothing. Acceptance: (1) moving a task to done clears hold and its reason, until, by and at fields; (2) a one-time migration clears hold on tasks that are already done; (3) the UI Held list and the driver brief exclude done tasks even if a stale hold remains; (4) tests for each.

## Shots
```json
[
{
"label": "Active-without-engineer recovery window setting",
"target": "default",
"route": "/settings?tab=general",
"highlight": "[id=\"setting-watchdog.activeWithoutEngineerRecoverMs\"]"
}
]
```

## Activity

- 2026-10-31T10:08:41Z · created · njachowski@gmail.com
- 2026-10-31T12:21:11Z · body: Also: stale state on done tasks (added)
- 2026-10-31T12:22:38Z · status inbox→ready
- 2026-10-31T13:04:46Z · body: Also: holds on done tasks (added)
- 2026-10-31T16:40:06Z · cli_override, model_override
- 2026-10-31T17:47:24Z · status ready→active, branch
- 2026-10-31T18:10:25Z · note: adopted orphaned engineer pid 58658
- 2026-10-31T18:12:05Z · note: adopted orphaned engineer pid 58658
- 2026-10-31T19:01:10Z · body
- 2026-10-31T19:01:30Z · body
- 2026-10-31T19:45:25Z · watchdog: check wait escalated · waiting: waiting for a local check slot (2 ahead, position 3); waiting behind #0993 check (pid 17200, alive), #0994 check (pid 64804, alive); slot holder has made no progress for 30 minutes (no heartbeat) for 6s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-10-31T19:59:55Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-10-31T20:15:11Z · watchdog: check wait escalated · waiting: waiting for a local check slot (2 ahead, position 3); waiting behind #0993 check (pid 83935, alive), #0994 check (pid 97854, alive); slot holder has made no progress for 30 minutes (no heartbeat) for 5s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-10-31T20:26:12Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-10-31T20:27:05Z · body
- 2026-10-31T20:57:30Z · watchdog: check wait escalated · waiting: waiting for a Playwright slot — position 2 (1 ahead); slot holder has made no progress for 30 minutes (no heartbeat) for 3s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-10-31T20:58:00Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-10-31T22:32:52Z · note: handoff requested (ui-review)
- 2026-10-31T23:09:32Z · handoff failed · ui-review handoff failed at check · repoos check failed: tests — } >
- 2026-10-31T23:10:48Z · message_queued at 2026-10-31T23:10:48.146Z
- 2026-10-31T23:18:24Z · engineer stopped by request
- 2026-10-31T23:18:29Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-10-31T23:19:39Z · model_override
- 2026-10-31T23:21:33Z · message_queued at 2026-10-31T23:21:33.854Z
- 2026-10-31T23:26:46Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — ui-review handoff failed at check · repoos check failed: tests — } > · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-10-31T23:26:46Z · note: handoff requested (cli)
- 2026-11-01T00:05:15Z · note: ui verification failed (1 issue(s)): [missing-target] Active-without-engineer recovery window setting (target "default"): highlight [data-setting-key="watchdog.activeWithoutEngineerRecoverMs"] matched nothing on /settings?tab=watchdog (http://127.0.0.1:56263/settings?tab=watchdog)
- 2026-11-01T00:05:15Z · handoff failed · task-file handoff failed at verify · ui verification failed (1 issue(s)): [missing-target] Active-without-engineer recovery window setting (target "default"): highlight [data-setting-key="watchdog.activeWithoutEngineerRecoverMs"] matched nothing on /settings?tab=watchdog (http://127.0.0.1:56263/settings?tab=watchdog)
- 2026-11-01T00:07:15Z · message_delivered: 2 message(s)
- 2026-11-01T01:25:01Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-11-01T01:33:12Z · note: handoff requested (ui-review)
- 2026-11-01T02:09:28Z · note: ui verification failed (1 issue(s)): [missing-target] Active-without-engineer recovery window setting (target "default"): highlight [data-setting-key="watchdog.activeWithoutEngineerRecoverMs"] matched nothing on /settings?tab=watchdog (http://127.0.0.1:55195/settings?tab=watchdog)
- 2026-11-01T02:09:29Z · handoff failed · ui-review handoff failed at verify · ui verification failed (1 issue(s)): [missing-target] Active-without-engineer recovery window setting (target "default"): highlight [data-setting-key="watchdog.activeWithoutEngineerRecoverMs"] matched nothing on /settings?tab=watchdog (http://127.0.0.1:55195/settings?tab=watchdog)
- 2026-11-01T02:10:59Z · body
- 2026-11-01T02:11:07Z · note: handoff requested (ui-review)
- 2026-11-01T02:40:56Z · status active→review
- 2026-11-01T02:41:01Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (f134266a1) during finalization (#0734)
- 2026-11-01T02:42:21Z · note: review pass 1: good to go
- 2026-11-01T08:33:41Z · watchdog: check wait escalated · waiting: waiting for a local check slot (2 ahead, position 3); waiting behind #0995 check (pid 53971, alive), #0994 check (pid 49829, alive); slot holder has made no progress for 30 minutes (no heartbeat) for 10s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-01T08:43:29Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-01T08:43:50Z · watchdog: check wait escalated · waiting: waiting for a local check slot (2 ahead, position 3); waiting behind #0995 check (pid 53971, alive), #0994 check (pid 49829, alive); slot holder has made no progress for 30 minutes (no heartbeat) for 13s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-01T08:54:05Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-01T09:02:36Z · note: Nick explicitly approved restarting Move to done and landing if remote validation passes. Duplicate local tests stopped; server remote validator restarted; thinkpad, bee and mini passed prerequisite probes.
- 2026-11-01T09:45:05Z · close-out gate completed in 764s

