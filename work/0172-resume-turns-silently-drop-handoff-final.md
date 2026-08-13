---
id: "0172"
title: Resume turns silently drop handoff finalization because session task/branch are never persisted
type: bug
status: ready
needs_merge: true
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: feat/resume-turns-silently-drop-handoff-final
created_at: "2026-08-13T13:55:49Z"
updated_at: "2026-08-13T16:32:15Z"
---
## Problem

A handoff emitted on a follow-up/resume turn is silently dropped. `persist()` in `src/server/agents.ts` (~line 2400) writes only `lines, sessionId, engine, workdir, completedAt, updatedAt` to the persisted session — never `task` or `branch`. Any later resume turn (watchdog nudge, `POST /api/tasks/:id/message`, reviewer follow-up) reloads the session with `task`/`branch` unset, `send()` passes them into `spawnTurn`, and the cleanup guard `entry.handoffRequested && exitedCleanly && entry.task && entry.branch && entry.workdir` (agents.ts:2222) fails on `entry.task` — so `onHandoff` never runs. The transcript records `✓ agent requested server-side handoff`, the process exits, and nothing else happens: no finalization, no error, task stuck `active`.

Observed on #0105 and #0118 on 2026-08-13: every retrigger (watchdog + human messages) produced a fresh `✓ agent requested server-side handoff` with zero follow-through, while the one real finalization attempt (a start turn, #0118) got as far as `Server finalization: check`. Start turns finalize; resume turns can never.

The watchdog's escalation text ('handoff signal was not detected after the automatic resume') is therefore misleading: the signal IS detected and recorded; the finalization is being skipped.

## Desired UX

Any turn — start or resume — that ends with the handoff signal runs server-side finalization identically. There is no silent path where a detected handoff is dropped.

## Acceptance criteria

- [ ] `send()` / resume turns resolve the current task (from the repo task index) so `entry.task` and `entry.branch` are always set; the entry no longer depends on persisted session fields that are never written.
- [ ] If a handoff is ever detected but cannot be finalized, an explicit `✗` reason is recorded (never a silent drop).
- [ ] A regression test: start a task, force a resume turn that emits the handoff signal, and assert finalization runs on the resume turn (transcript shows `Server finalization started`).
- [ ] `repoos check` passes.

## Notes for AI

- `session.task`/`session.branch` are set in memory on start turns only; the persisted payload omits them. The runner has access to the repo task index (`runner` is constructed with one in `src/server/server.ts`), so resolve the task by `taskId` at send/cleanup time rather than relying on the session.
- Related but distinct from #0169 (finalization wedge at the `check` step) and #0168 (stale serve processes). This task is specifically the resume-turn handoff drop.

## Activity

- 2026-08-13T13:55:49Z · created · unknown
- 2026-08-13T14:00:30Z · status inbox→ready
- 2026-08-13T16:32:15Z · needs_merge
