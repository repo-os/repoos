---
id: "0921"
title: "Local check slots are held by dead processes for 30 minutes: reclaim a slot as soon as its holder pid is gone"
type: feature
status: inbox
priority: p1
area: [core, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-22T05:41:12Z"
updated_at: "2026-10-22T05:41:21Z"
---
## Problem
2026-10-22 13:20-13:57: #0909's close-out checks sat 'queued · local check (position 3, 2 ahead)' because both local check slots (src/core/cross-process-slots.ts, 2 slots) were held by processes that no longer existed: slot 0 by #0918's check (pid 45795) and slot 1 by #0909's own earlier check (pid 78147, the run that was cancelled with Stop MTD). isStaleSlot() frees a slot only when the slot directory has had no heartbeat for STALE_MS = 30 minutes; the .holder file with the pid is written but never checked. A killed or cancelled check therefore blocks every later local check for up to 30 minutes. #0909 and #0914 both waited; the task card said 'queued' with no hint that the owners were dead. Manual fix used: verified both pids were not running and removed .repoos/local-check-slots/0 and /1.

## Desired UX
A slot whose holder process is gone is reclaimed within seconds (one heartbeat interval), and a cancelled or killed check releases its slot on exit (finally/signal handlers). The queued card names the holder ('held by #0918 check, pid 45795, alive'), and says 'holder is gone, reclaiming' when it is dead.

## Acceptance criteria
- isStaleSlot / acquire checks .holder pid liveness (process.kill(pid, 0) or equivalent) in addition to the 30 minute mtime rule; a dead holder frees the slot immediately; test with a fake dead pid and a live pid, and with a pid that was reused (compare start time or add a random token to .meta.json).
- Cancel (Stop MTD) and SIGTERM/SIGINT release the slot; test that a cancelled check frees its slot before the next one starts.
- Queue marker and close-out card show who holds each slot and whether it is alive.
- Docs: docs/debugging-check-failures.md section on stuck 'queued · local check'.

## Notes for AI
Evidence: .repoos/local-check-slots/{0,1}/.holder and .meta.json at 13:40 (both holders dead, dir mtime 13:27:02). Related: #0917, #0918, #0919 (CLI cancel).

## Activity

- 2026-10-22T05:41:12Z · created · njachowski@gmail.com
