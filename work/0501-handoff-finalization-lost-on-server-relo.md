---
id: "0501"
title: Handoff finalization lost on server reload strands task in active
type: bug
status: ready
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-25T06:24:46Z"
updated_at: "2026-09-25T15:38:41Z"
---
## Problem

A server reload during handoff finalization silently drops the in-flight
`repoos check`, and nothing ever resumes it. The task stays `active` with no
result, then a chain of follow-on behavior turns it into a misleading
"agent exited with an error" dev-error.

## Incident (#0499, 2026-09-25, times UTC)

- 06:01:13 engineer emitted `::repoos-handoff-ready::`.
- 06:01:14 server finalization started; transcript's last line is
  `Server finalization: check`.
- 06:02:04 #0498's close-out merged to `main` → build changed → auto-reload
  (`reload: spawning replacement … (build changed (poll))` in
  `.repoos/logs/server.out`). The old server's in-flight check died with it.
  `task-check.ts` is in-memory only, and `.repoos/pending-handoffs.json` was
  already empty, so the replacement server never re-ran the finalization.
- 06:06:17 the CTO watchdog nudged the engineer ("idle for five minutes")
  even though the task was mid-finalization.
- 06:08:46 the resumed engineer ran `repoos mv 0499 review` directly instead of
  re-emitting the handoff signal; the task flipped active→review→active in the
  same second and the agent process was killed mid-command.
  `escalateFailedExit` (`src/server/agents.ts`) then recorded
  `needs_input_detail: "Server finalization: check"` — the last sys line —
  which reads like a check failure but is just "the check started".

Note: the engineer had not committed at the first handoff (commit came at
06:08:42), so the first finalization would probably have failed its commit
step anyway. That's separate from the bug but worth a clearer message.

## Fix (three parts, one incident)

1. **Survive reload mid-finalization (root cause).** The persisted pending
   handoff (#0235, `persistPendingHandoff` / boot recovery in
   `src/server/agents.ts`) must stay on disk until finalization reaches a
   terminal result (ok or a recorded failure), not be cleared when it starts.
   On boot, a handoff whose finalization never finished is re-fired. The
   reload handover should also either wait for in-flight handoff finalizations
   or rely on this recovery explicitly.
2. **CTO / watchdog must not treat an in-flight or pending handoff as idle.**
   Skip the idle nudge while `runner.isHandoffInFlight(id)` or a pending
   handoff exists (`src/server/cto.ts`, `src/server/task-watchdog.ts`).
3. **Honest failure detail.** When an agent exit is escalated while/after a
   finalization never produced a result, the dev-error detail should say so
   (e.g. "handoff finalization was interrupted (server reload) — restart work
   to hand off again"), not echo a progress line like `Server finalization:
   check`. Progress lines should not be picked as the failure reason.

## Acceptance

- Test: start a handoff finalization, simulate a server restart before the
  check completes → the new server resumes finalization and the task reaches
  review (or a real, recorded failure).
- Test: CTO/watchdog does not nudge a task with a handoff in flight/pending.
- Test: an interrupted finalization produces a clear dev-error detail.

## Activity

- 2026-09-25T06:24:46Z · created · unknown
- 2026-09-25T15:38:41Z · status inbox→ready
