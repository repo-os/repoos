---
id: "0993"
title: Auto-recover tasks that are active with no live engineer
type: bug
status: inbox
priority: p1
area: server
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-31T10:08:41Z"
updated_at: "2026-10-31T12:21:11Z"
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

## Activity

- 2026-10-31T10:08:41Z · created · njachowski@gmail.com
- 2026-10-31T12:21:11Z · body: Also: stale state on done tasks (added)
