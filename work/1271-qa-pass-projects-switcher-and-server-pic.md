---
last_handoff_failure_fingerprint: "check|the worktree changed while the gate was running (appeared: mobile/src/App.vue, mobile/src/components/BottomSheet.vue, mobile/src/style.css, mobile/src/components/DevUpdateDialog.vue, mobile/src/modal-focus.ts, src/ui-app/tests/mobile-update-dialog-focus.test.ts) — the check result no longer describes what is committed, so the handoff was refused. Nothing was lost: the change is still in the worktree. Re-run the handoff once the worktree is stable."
last_handoff_failure_sha: f9ff295b43cac150ac1de4268f97155c4992d986
id: "1271"
title: "QA pass: Projects switcher and server picker flows"
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-projects-switcher-and-server-pic
cli_override: claude code
model_override: haiku
created_at: "2026-11-20T06:07:22Z"
updated_at: "2026-11-20T13:54:14Z"
review_rounds: 1
review_passes: 2
handoff_signal_retry_count: 2
close_out_repair_count: 1
---
## Problem
Sweep the project switcher and server picker (add, switch, offline and error states) for layout, wording and state bugs.

## Desired UX
Flows look and behave correctly at 375, 768 and 1280 widths: no overflow, clear labels, sensible empty, loading and error states, visible keyboard focus.

## Acceptance criteria
- Walked headlessly (Playwright only, never a visible browser) at the three widths.
- Every issue found is fixed, covering the whole class of the problem.
- Scoped check passes once, then hand off.

## Notes for AI
Keep changes small. Never touch repoos.toml. Never open a visible browser.

## Activity

- 2026-11-20T06:07:22Z · created · t@t
- 2026-11-20T06:07:27Z · status inbox→ready
- 2026-11-20T06:07:29Z · cli_override, model_override
- 2026-11-20T06:07:30Z · status ready→active, branch
- 2026-11-20T06:25:44Z · body
- 2026-11-20T06:27:03Z · CTO nudge: held — handoff gate is running
- 2026-11-20T06:27:25Z · status active→review
- 2026-11-20T06:27:25Z · message_queued at 2026-11-20T06:27:25.704Z
- 2026-11-20T06:27:25Z · note: shots: skipped — the diff (4 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-20T06:27:56Z · note: review pass 1: good to go
- 2026-11-20T07:40:40Z · message_overdue: still queued after 60m without being delivered
- 2026-11-20T09:44:54Z · status review→active
- 2026-11-20T09:44:54Z · note: close-out repair: gate-failure
- 2026-11-20T09:45:01Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-20T09:50:16Z · message_queued at 2026-11-20T09:50:16.108Z
- 2026-11-20T09:55:33Z · message_queued at 2026-11-20T09:55:33.178Z
- 2026-11-20T10:00:44Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-11-20T10:00:45Z · note: handoff requested (cli)
- 2026-11-20T10:02:08Z · message_delivered: 1 message(s)
- 2026-11-20T10:02:37Z · CTO nudge: held — handoff gate is running
- 2026-11-20T10:30:53Z · message_queued at 2026-11-20T10:30:53.432Z
- 2026-11-20T10:30:55Z · handoff failed · task-file handoff failed at check · server-side finalization timed out (deadline exceeded)
- 2026-11-20T10:37:05Z · watchdog: check wait escalated · waiting: waiting for serialized local fallback (1 ahead, position 2); slot holder 49112 is dead for 16m · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-20T10:38:08Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-20T10:42:06Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-20T11:07:05Z · message_overdue: still queued after 60m without being delivered
- 2026-11-20T11:08:01Z · body
- 2026-11-20T11:09:30Z · handoff_deferred: 3 queued message(s) must be read before review
- 2026-11-20T11:09:30Z · message_queued at 2026-11-20T11:09:30.758Z
- 2026-11-20T11:09:31Z · ↻ resuming engineer to read queued message
- 2026-11-20T11:09:32Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The second scoped check passed with exit 0. I'll confirm the report draft is still present, since the earlier listing came back empty, and check the branch state before requesting handoff. · stderr: (empty)
- 2026-11-20T11:20:58Z · message_delivered: 4 message(s)
- 2026-11-20T11:25:23Z · body
- 2026-11-20T11:38:30Z · CTO nudge: held — handoff gate is running
- 2026-11-20T11:57:17Z · message_queued at 2026-11-20T11:57:17.969Z
- 2026-11-20T11:58:33Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-20T12:00:31Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-20T12:18:53Z · message_delivered: 1 message(s)
- 2026-11-20T12:22:29Z · body
- 2026-11-20T12:24:03Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: I haven't handed this off. The scoped `repoos check` fails, and the failure comes from `main`, not from this branch. **What's blocking handoff** - `rendered-contrast` fails on the Settings page. The muted text (`#686e76` on `#161b23`, 3.36… · stderr: (empty)
- 2026-11-20T12:33:42Z · CTO action: restart-stalled-agent (resume) · agent crashed or was interrupted mid-turn — task-file handoff failed at check · server-side finalization timed out (deadline exceeded)
- 2026-11-20T13:06:37Z · body
- 2026-11-20T13:11:38Z · body
- 2026-11-20T13:13:33Z · CTO nudge: held — handoff gate is running
- 2026-11-20T13:26:08Z · status active→review
- 2026-11-20T13:26:10Z · message_queued at 2026-11-20T13:26:10.161Z
- 2026-11-20T13:26:11Z · note: shots: skipped — the diff (10 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-20T13:28:39Z · note: review pass 2: needs some work
- 2026-11-20T13:28:43Z · status review→active
- 2026-11-20T13:28:49Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-20T13:34:02Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — task-file handoff failed at check · server-side finalization timed out (deadline exceeded) · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-11-20T13:34:03Z · note: handoff requested (cli)
- 2026-11-20T13:38:33Z · CTO nudge: held — handoff gate is running
- 2026-11-20T13:40:27Z · message_delivered: 1 message(s)
- 2026-11-20T13:54:14Z · handoff failed · task-file handoff failed at check · the worktree changed while the gate was running (appeared: mobile/src/App.vue, mobile/src/components/BottomSheet.vue, mobile/src/style.css, mobile/src/components/DevUpdateDialog.vue, mobile/src/modal-focus.ts, src/ui-app/tests/mobile-update-dialog-focus.test.ts) — the check result no longer describes what is committed, so the handoff was refused. Nothing was lost: the change is still in the worktree. Re-run the handoff once the worktree is stable.

