---
id: "0235"
title: Persist handoff requests across interrupted agent turns
type: bug
status: active
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: feat/persist-handoff-requests-across-interrup
model_override: default
pm_model_override: default
created_at: "2026-08-16T14:52:17Z"
updated_at: "2026-08-17T08:57:13Z"
review_rounds: 1
---
## Problem

When an agent turn is interrupted (server restart, crash, SIGKILL) after the agent emitted the `::repoos-handoff-ready::` signal but before the server-side finalization completes, the handoff request is lost. The `handoffRequested` flag lives only in the in-memory `AgentRunner` entry — it is never persisted to disk. On the next server boot, the registry is empty, the entry is gone, and the task sits in `active` with committed, checked work that never moves to `review`.

This is the #0172 gap's sibling: #0172 fixed the case where a *resume* turn's handoff was dropped because `task`/`branch` were never persisted in the session. This task fixes the case where the handoff itself — the capability to finalize — is lost entirely across a process boundary, regardless of whether it was a start or resume turn.

The watchdog eventually catches these stuck tasks and auto-surfaces them to `review`, but only after the staleness threshold (5 minutes by default). In the meantime the task is invisible on the board and the human has to manually intervention. Worse, if the watchdog's `autoTransition` is off, the task escalates to `needsInput` and stays stuck until a human acts.

Observed on multiple tasks during reload-heavy development sessions: the agent finishes its work, emits the handoff signal, the transcript records `✓ agent requested server-side handoff`, then the server reloads or the process is killed before `onHandoff` fires. The task is permanently stuck `active` until the watchdog surfaces it.

## Desired UX

Handoff requests survive interrupted turns and server reloads. When the server starts (or restarts), any task that had a pending handoff — the agent emitted the signal, the turn was interrupted before finalization — is automatically finalized: `repoos check` runs in the worktree, the branch is committed, and the task moves to `review`. The human sees the task land in `review` with no manual intervention needed.

If finalization fails (e.g. `repoos check` fails on the recovered request), the task stays `active` and the failure is recorded — same as a normal failed handoff. The request is not retried on every boot.

## Acceptance criteria

- [ ] `AgentRunner` persists a handoff request to a durable on-disk store (`pending-handoffs.json`) the moment the `::repoos-handoff-ready::` signal is recognized in agent output, before the turn exits.
- [ ] `recoverPendingHandoffs()` is called at server boot (after `adoptRunningAgents()`), validates each persisted request (task still exists, still active, branch matches, not already finalizing), and re-fires `onHandoff` for valid ones.
- [ ] The persisted pending handoff is cleared when: (a) finalization starts (the request moves to the in-flight set), (b) a fresh turn supersedes it (`send()` clears it), or (c) the task leaves active (moved to done/closed).
- [ ] When an interrupted turn's handoff is retained, the transcript records a clear message: the request is not lost, it will be finalized on the next server start.
- [ ] The watchdog's `classifyDeadAgentReason` and `suggestNextStep` correctly handle the new `retained for recovery` wording.
- [ ] `repoos check` passes.

## Notes for AI

- **Files to touch:** `src/server/agents.ts` (persist/recover/clear logic, `applySignals`, `cleanup`, `send`, `close`), `src/server/server.ts` (call `recoverPendingHandoffs` at boot).
- **Do NOT** change the handoff finalization logic in `src/server/handoff.ts` — the recovered request goes through the same `onHandoff` path as a normal one.
- **Do NOT** persist the `handoffRequested` boolean on the Session — it is transient per-turn and should stay that way. The pending-handoff store is a separate, coarser-grained durable artifact.
- The store format is `{ requests: AgentHandoffRequest[] }` — a flat list keyed by `taskId`. Newer runs supersede older ones for the same task.
- Atomic writes: use the same temp-file + rename pattern as `persist()` for session transcripts.
- `recoverPendingHandoffs` must be idempotent: if it runs twice (e.g. the server reloads again before finalization completes), it should not re-fire a request that is already in `handoffsInFlight`.
- Related: #0172 (resume-turn handoff drop), #0169 (finalization wedge at check step), #0156 (watchdog escalation).

## Activity

- 2026-08-16T14:52:17Z · created · unknown
- 2026-08-16T15:01:28Z · status inbox→ready
- 2026-08-16T15:01:31Z · status ready→active, branch
- 2026-08-17T03:39:56Z · watchdog: auto-surfaced stuck task · status active→review · agent never started — no session exists for this task · next step: resume the session manually from the task's worktree and check for uncommitted work
- 2026-08-17T06:31:59Z · model_override
- 2026-08-17T06:32:01Z · pm_model_override
- 2026-08-17T12:00:00Z · pm: fleshed out task description (problem, desired UX, acceptance criteria, notes)
- 2026-08-17T07:23:50Z · body
- 2026-08-17T07:26:38Z · status review→ready
- 2026-08-17T07:26:43Z · status ready→active
- 2026-08-17T07:42:31Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-08-17T08:03:34Z · status active→review
- 2026-08-17T08:05:14Z · status review→active
- 2026-08-17T08:57:13Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
