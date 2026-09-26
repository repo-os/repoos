---
id: "0505"
title: Handoff after an unclean agent exit is parked until a server restart that never comes
type: bug
status: active
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: feat/handoff-after-an-unclean-agent-exit-is-p
review_model_override: opencode-go/space-bunny-free
created_at: "2026-09-26T00:57:06Z"
updated_at: "2026-09-26T01:02:53Z"
---
## Problem

When an agent emits `::repoos-handoff-ready::` and then exits non-zero, the
runner assumes the server was interrupted and parks the handoff for "the next
server start" (#0235). If the server is still up — the common case — nothing
ever finalizes it, and nothing tells the human. The task sits in `active`
indefinitely.

## Incident (#0503, 2026-09-25, times UTC)

- 17:33–17:37 engineer (opencode, `opencode-go/space-bunny-free`) finished the
  Gruvbox theme, ran the scoped `repoos check` (green), wrote its "Done" summary.
- 17:37:56 `✓ agent requested server-side handoff`, then the process exited
  non-zero with an empty stderr (`.repoos/agent-logs/0503.err.log` is 0 bytes;
  the last stdout event is the final `text` part).
- 17:37:57 `⚠ handoff retained for recovery — the request will be finalized on
  the next server start`. `.repoos/pending-handoffs.json` still holds the
  request. The server stayed up, so recovery never ran.
- Nothing surfaced it: `cleanup()` in `src/server/agents.ts` (~L5733) skips
  `escalateFailedExit` when `entry.handoffRequested`, and `TaskWatchdog`
  (`src/server/task-watchdog.ts`, `HANDOFF_RETAINED`) treats "retained for
  recovery" as not stuck. The only hint was the card chip "requested review",
  which doesn't say the server is waiting on a restart.

## Fix

1. **Don't wait for a restart that isn't coming.** In the
   `entry.handoffRequested && !exitedCleanly` branch of `cleanup()`, the server
   is demonstrably alive — the agent process ended, not the server. Finalize
   the handoff now through the same path as a clean exit (`onHandoff`, which
   re-runs `repoos check` server-side, so a half-finished turn can't slip
   through). Keep the persist-for-next-boot behavior only for the case it was
   designed for: the server itself going away mid-turn (already covered by the
   request being persisted at signal time).
2. **If finalization can't proceed, say so.** Any exit where the handoff is
   neither finalized nor in flight must escalate to `needs_input` with an
   honest detail (e.g. "agent exited with code N after requesting handoff —
   Restart work or click Review"). The watchdog must not treat a retained
   handoff as healthy indefinitely while the server that would recover it is
   the one running.
3. **Recovery must be a no-op for a task that already moved on.** Unverified
   today: if a human clicks Review (or Move to done) on a task that still has a
   pending handoff, the next server start's `recoverPendingHandoffs` re-fires
   it. `handoffTask` (`src/server/handoff.ts`) returns "already finalized" only
   when BOTH main's and the worktree's copy say `review`; the worktree copy
   usually still says `active` (see AGENTS.md, stuck-active section), so it may
   re-run the check and re-patch status. Verify and fix: clear the pending
   handoff whenever the task leaves `active` by any route (Review button,
   PATCH, `repoos mv`, done, abandon), and have recovery skip a request whose
   task is no longer `active`.

## Acceptance

- Test: handoff signal + non-zero exit with the server alive → finalization
  runs immediately and the task reaches review (or a recorded failure with
  needs_input).
- Test: a pending handoff for a task already in `review`/`done` is dropped on
  boot without running a check or changing status.
- Test: moving a task out of `active` by hand clears its pending handoff.
- #0503 itself: once fixed, its stale `pending-handoffs.json` entry must not
  disturb it on the next server start.

## Activity

- 2026-09-26T00:57:06Z · created · unknown
- 2026-09-26T01:02:43Z · review_model_override
- 2026-09-26T01:02:46Z · status inbox→ready
- 2026-09-26T01:02:53Z · status ready→active, branch
