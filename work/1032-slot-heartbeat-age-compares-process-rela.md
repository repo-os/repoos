---
id: 1032
title: "Slot heartbeat age compares process-relative Bun hrtime across processes: false 'stalled' alarms and possible live-slot reclaim"
type: bug
status: active
priority: p1
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/slot-heartbeat-age-compares-process-rela
created_at: "2026-11-04T12:04:25Z"
updated_at: "2026-11-04T12:31:16Z"
---
## Problem

`src/core/cross-process-slots.ts` writes `.heartbeat.json` / `.started.json` with `monotonicMs: process.hrtime.bigint()/1e6` and a DIFFERENT process (the server watchdog, or a waiting check) reads it back as `monotonicMs() - heartbeat.monotonicMs` (lines ~177, 237, 241). Under Bun, `process.hrtime` is relative to PROCESS START (verified: a fresh `bun -e` prints 1), under Node it is system uptime (46516981). So across Bun processes the age is (reader uptime - writer's uptime at heartbeat), i.e. roughly the reader's own uptime.

Observed 2026-11-04: #0715's check (pid 68910, started 19:49, heartbeat file fresh at 20:03, 401/506 test files done) was reported by the server watchdog (up ~3h) as 'slot holder has made no progress for 30 minutes (no heartbeat)'. #1023 and #1028 close-outs showed Needs input / WAITING FOR YOU although nothing was wrong; the flag cleared and re-fired repeatedly all day (see the 1023 Activity log). Worse, the same math feeds the stale-slot reclaim at ~line 178 and `wedged` (line 265), so a waiting check can judge a LIVE holder stale and take its slot, running more heavy jobs than heavySlots allows (load was 12-13 at the time).

## Desired behaviour

Cross-process heartbeat/started ages use the wall clock (`wallMs`, already stored) or file mtime, never a monotonic value from another process. If monotonic protection against clock jumps is wanted, compare monotonic values only within the same pid.

## Acceptance criteria

1. Test: a heartbeat written by a different Bun process (or with a small monotonicMs against a large reader monotonic) is reported with age ~0, not reader uptime.
2. Test: a heartbeat whose wallMs is >30m old is still reported stalled/wedged.
3. Test: reclaim never takes a slot with a fresh heartbeat held by a live pid.
4. Watchdog no longer raises check-wait needs_input for a healthy, progressing holder.

## Notes for AI

Search for `monotonicMs` in cross-process-slots.ts (writers at ~380, 385, 484). Runtime is Bun; see AGENTS.md Runtime section and add the finding to docs/architecture.md (Bun vs Node hrtime differ).

## Activity

- 2026-11-04T12:04:25Z · created · njachowski@gmail.com
- 2026-11-04T12:12:33Z · status inbox→ready
- 2026-11-04T12:12:36Z · status ready→active, branch
- 2026-11-04T12:24:28Z · message_queued at 2026-11-04T12:24:28.179Z
- 2026-11-04T12:24:28Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-04T12:29:28Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-04T12:31:16Z · body
