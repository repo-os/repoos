---
id: "0507"
title: Agent's own repoos mv to review is recorded as a failed exit with a bogus needs-input
type: bug
status: inbox
priority: p2
area: server
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-09-26T02:27:03Z"
updated_at: "2026-09-26T02:27:03Z"
---
## Problem

When an engineer moves its own task out of `active` (typically `repoos mv <id>
review` after a CTO nudge), the server stops that very agent and then records
the stop as "agent exited with an error", setting `needs_input: dev-error`
with a meaningless detail. The task shows **needs input** next to **waiting for
human** even though nothing is wrong.

## Incidents

- **#0505 (2026-09-26, UTC):** 01:49 first turn exited cleanly without the
  handoff signal → 01:54 CTO nudge "…commit and hand off to review" → engineer
  committed and ran `repoos mv 0505 review` → 01:56:28 `status active→review`
  and, same second, `agent exited with an error (cursor) · Skill routing:
  code-review, diagnose-repoos-close-out-validation-failures, frontend-testing`.
- **#0499 (2026-09-25 06:08:46):** same shape — CTO nudge, engineer ran
  `repoos mv 0499 review`, process killed mid-command, dev-error recorded with
  detail `Server finalization: check`.

## Mechanism

1. `server.ts` (~L1727): `if (prev === "active" && next !== "active") void
   runner.stop(task.id);` — the agent that issued the `repoos mv` is SIGTERMed.
2. `AgentRunner.stop()` (`src/server/agents.ts`) doesn't mark the stop as
   intentional (unlike pause), so `cleanup()` sees a non-clean exit and calls
   `escalateFailedExit`.
3. `lastFailureLine()` falls back to the last `sys` line in the transcript,
   whatever it is ("Skill routing: …", "Server finalization: check").
4. Root cause of the `repoos mv` itself: the CTO nudge text ("commit and hand
   off to review", `src/server/cto-monitor.ts` / `cto.ts`) and parts of the
   engineer prompt read as "move the task to review", so engineers run
   `repoos mv … review` instead of emitting `::repoos-handoff-ready::`. That
   also skips the server-side handoff `repoos check` (only the commit/vacuity
   guard runs), leaving the full check to MTD.

## Fix (one change, three parts)

1. **Server-initiated stops aren't failures.** When the runner stops an agent
   because its task left `active` (or any other server/human-initiated stop),
   record it as a deliberate stop — no `escalateFailedExit`, no
   `dev_error_count` bump, no needs-input.
2. **Nudge toward the handoff signal.** Reword the CTO nudge and any engineer
   prompt text that says "hand off to review" to say: run the scoped check,
   commit, then emit `::repoos-handoff-ready::` — and never `repoos mv <own id>
   review`. Consider having `repoos mv` refuse (with that advice) when run from
   inside the task's own runner session (`REPOOS_TASK_ID` matches).
3. **Honest failure detail.** `lastFailureLine()` should only use a line that
   actually describes a failure (stderr, CLI error events, recorded failure
   markers), never an arbitrary progress/`sys` line; fall back to the generic
   message otherwise. #0501 fixed one instance of this; make it general.

## Acceptance

- Test: an agent whose task is moved out of `active` while it runs exits
  without setting needs_input or bumping `dev_error_count`.
- Test: the CTO nudge text references the handoff signal, not "move to review".
- Test: `lastFailureLine` never returns a plain progress sys line (e.g.
  "Skill routing: …", "Server finalization: check").

## Activity

- 2026-09-26T02:27:03Z · created · unknown
