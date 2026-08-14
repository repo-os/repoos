---
review_rounds: 1
id: "0169"
title: "Server-side handoff finalization must fail loudly and durably, never wedge silently"
type: bug
status: review
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: feat/server-side-handoff-finalization-must-fa
created_at: "2026-08-13T13:50:42Z"
updated_at: "2026-08-14T00:03:09Z"
---
## Problem

When an agent emits `::repoos-handoff-ready::` and the runner detects it (`✓ agent requested server-side handoff`), the server calls `handoffTask` (validate → check → commit → review). On 2026-08-13 all three active tasks (#0105, #0112, #0118) wedged at the `check` step: transcripts show `Server finalization started — validating the runner handoff` then `Server finalization: check` then nothing. No `✓ task moved to review`, no `✗ Server finalization stopped at check: ...`, no `✗ server-side handoff failed`, no uncaught-exception line. The tasks stayed `active` forever and the watchdog looped re-nudging them.

`handoffTask`'s `check` step runs `repoos check` in the worktree with a 240s timeout (`src/server/handoff.ts`), but the surrounding promise apparently never settles and the failure path in `src/server/server.ts` (onHandoff) never runs. The result: silent, persistent task hang with no actionable signal.

## Desired UX

A finalization that cannot complete must leave a durable, visible, actionable record — never a silent pending state. The board shows the exact step and reason, the transcript gets the ✗ entry, and the watchdog stops blindly re-nudging when the task is already mid-finalization.

## Acceptance criteria

- [ ] If `repoos check` in the finalization `check` step times out, is killed, or fails, a `✗ Server finalization stopped at check: <reason>` entry is written to the transcript and the task is left in a state the user can act on (needs_input or an explicit error banner).
- [ ] The finalization promise cannot hang forever: a hard deadline on the whole `handoffTask` (not just the subprocess) guarantees settle.
- [ ] A second handoff request for a task that already has a finalization in flight is refused with a clear 'already finalizing' message instead of stacking a second finalization.
- [ ] A regression test forces the check step to time out / fail and asserts the transcript entry and task state.
- [ ] `repoos check` passes.

## Notes for AI

- Scope overlap with #0118 (serialize close-outs with a merge queue and main-SHA validation) is fine — #0118 is about inter-close-out races; this task is about a single finalization not recording its own failure.
- Suspects: the 240s timeout in `run()` in `src/server/handoff.ts` may not fire for a hung bun subprocess, the `await handoffTask` in `src/server/server.ts` has no outer deadline, and concurrent watchdog resume writes may be racing the finalization.

## Activity

- 2026-08-13T13:50:42Z · created · unknown
- 2026-08-13T14:00:19Z · status inbox→ready
- 2026-08-13T23:53:52Z · status ready→active, branch
- 2026-08-14T00:03:09Z · status active→review

