---
id: "0921"
title: "Local check slots are held by dead processes for 30 minutes: reclaim a slot as soon as its holder pid is gone"
type: feature
status: active
priority: p1
area: [core, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/local-check-slots-are-held-by-dead-proce
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-22T05:41:12Z"
updated_at: "2026-10-22T17:25:18Z"
---
## Problem
2026-10-22 13:20-13:57: #0909's close-out checks sat 'queued · local check (position 3, 2 ahead)' because both local check slots (src/core/cross-process-slots.ts, 2 slots) were held by processes that no longer existed: slot 0 by #0918's check (pid 45795) and slot 1 by #0909's own earlier check (pid 78147, the run that was cancelled with Stop MTD). isStaleSlot() frees a slot only when the slot directory has had no heartbeat for STALE_MS = 30 minutes; the .holder file with the pid is written but never checked. A killed or cancelled check therefore blocks every later local check for up to 30 minutes. #0909 and #0914 both waited; the task card said 'queued' with no hint that the owners were dead. Manual fix used: verified both pids were not running and removed .repoos/local-check-slots/0 and /1.

## Desired UX
A slot whose holder process is gone is reclaimed within seconds (one heartbeat interval), and a cancelled or killed check releases its slot on exit (finally/signal handlers). The queued card names the holder ('held by #0918 check, pid 45795, alive'), and says 'holder is gone, reclaiming' when it is dead.

## Acceptance criteria
- Liveness rules for local check slots (src/core/cross-process-slots.ts): the heartbeat stays at 15 s (HEARTBEAT_MS); STALE_MS drops from 30 minutes to about 60-90 s (4-6 missed beats), measured with a monotonic clock so laptop sleep or a machine stall does not count as missed beats (as #0679 does for close-out). Holder pid dead (process.kill(pid, 0), plus a start-time or random token in .meta.json to defeat pid reuse): free the slot immediately. Holder alive but silent for the stale window: mark it 'wedged' on the card at once and reclaim it (terminating the holder's process group cleanly, then SIGKILL) after a short grace of about 2-3 minutes, with a Settings control for the window and grace. Tests for dead pid, live pid, wedged live pid, reused pid, clock jump.
- Cancel (Stop MTD) and SIGTERM/SIGINT release the slot; test that a cancelled check frees its slot before the next one starts.
- Visibility, everywhere a user looks: the Checks page and the integration pipeline card list every local check slot (0 and 1) with the task that holds it, the pid, whether that process is alive, how long it has held it, and its heartbeat age; and list the queue behind it (task, position, how long waiting). A queued check names its blockers ('waiting behind #0918 check (pid 45795, dead, reclaiming)'). Same data in repoos driver brief --json and a CLI command (repoos checks slots).
- A manual 'release slot' action exists for a live but wedged holder (button and CLI), with a confirmation that names the holder.
- Docs: docs/debugging-check-failures.md section on stuck 'queued · local check', and docs/close-out-pipeline.md.

## Notes for AI
Evidence: .repoos/local-check-slots/{0,1}/.holder and .meta.json at 13:40 (both holders dead, dir mtime 13:27:02). Related: #0917, #0918, #0919 (CLI cancel).

## Shots
```json
[
{
"label": "Local check slot owners and queue",
"target": "default",
"route": "/checks?tab=now",
"highlight": ".ck-local-slots"
}
]
```

## Activity

- 2026-10-22T05:41:12Z · created · njachowski@gmail.com
- 2026-10-22T05:42:09Z · body: Acceptance criteria (added 3, removed 2)
- 2026-10-22T05:42:35Z · body: Acceptance criteria (added 2, removed 2)
- 2026-10-22T16:51:06Z · status inbox→ready
- 2026-10-22T16:51:12Z · cli_override, model_override
- 2026-10-22T16:51:13Z · status ready→active, branch
- 2026-10-22T16:51:17Z · message_queued at 2026-10-22T16:51:17.060Z
- 2026-10-22T16:52:15Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-22T17:03:07Z · body
- 2026-10-22T17:06:39Z · body
- 2026-10-22T17:09:34Z · body
- 2026-10-22T17:10:31Z · body
- 2026-10-22T17:10:43Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-10-22T17:10:43Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-22T17:10:43Z · message_delivered: 1 message(s)
- 2026-10-22T17:14:53Z · body
- 2026-10-22T17:22:15Z · message_queued at 2026-10-22T17:22:15.259Z
- 2026-10-22T17:22:15Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-22T17:22:16Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-22T17:24:35Z · body
- 2026-10-22T17:25:18Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-10-22T17:25:18Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-22T17:25:18Z · message_delivered: 1 message(s)
