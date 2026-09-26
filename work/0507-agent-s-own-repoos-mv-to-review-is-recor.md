---
id: "0507"
title: Unify every route into review behind the handoff finalization
type: bug
status: active
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: feat/unify-every-route-into-review-behind-the
cli_override: opencode
model_override: opencode-go/space-bunny-free
review_model_override: opencode/muse-spark-1.3-contributor-free
created_at: "2026-09-26T02:27:03Z"
updated_at: "2026-09-26T04:48:50Z"
---
## Problem

Routes into `review` check different amounts, and the one agents actually use
is the worst:

| Route | What runs before review |
|---|---|
| `::repoos-handoff-ready::` signal | Full server-side handoff finalization: scoped `repoos check`, then the commit gate |
| **Review** button (drawer) | Commit/vacuity gate only |
| `repoos mv <id> review` (agent or human) | Commit/vacuity gate only, via the file watcher — and it kills the calling agent |
| Board drag | Commit/vacuity gate only |

Engineers keep running `repoos mv <own id> review`, because the CTO nudge says
"commit and hand off to review" (`src/server/cto-monitor.ts:143`), AGENTS.md's
operating loop says "Set `status: review` when ready", and the engineer prompt
permits status changes via `repoos mv` (`src/server/agents.ts:2738`). The
handoff signal is only in the original mission prompt (step 4, `agents.ts:2859`),
which resume turns (e.g. after a CTO nudge) don't re-send.

When they do, the server stops the task's running agent because the task left
`active` (`server.ts` ~L1727, `runner.stop`). That stop isn't marked
intentional, so `cleanup()` calls `escalateFailedExit`, which bumps
`dev_error_count` and sets `needs_input: dev-error` with whatever `sys` line
came last (`lastFailureLine`) — "Skill routing: …", "Server finalization: check".

## Incidents

- **#0505 (2026-09-26, UTC):** 01:54 CTO nudge → engineer committed and ran
  `repoos mv 0505 review` → 01:56:28 `active→review` and, same second, `agent
  exited with an error (cursor) · Skill routing: code-review, …`. Showed
  "needs input" next to "waiting for human" on a task the reviewer passed.
- **#0499 (2026-09-25 06:08:46):** same shape; process killed mid-command,
  dev-error detail `Server finalization: check`.

## Fix

1. **`repoos mv <id> review` is the supported way to hand off.** Don't teach a
   new command — agents already reach for this one. When run inside the
   runner session for that same task (`REPOOS_TASK_ID` matches, or equivalent
   runner-provided marker), the CLI records a handoff request instead of
   flipping `status:` (e.g. a file the runner/server picks up — the agent
   sandbox has no HTTP access to the control plane, but can write files), prints
   "Handoff requested — RepoOS will run checks and move this to review", and
   exits 0. The runner treats it exactly like the handoff signal and finalizes
   when the turn ends. The `::repoos-handoff-ready::` signal keeps working as a
   synonym.
2. **One finalization path for every route into review.** Review button,
   board drag, PATCH `status: review`, the watcher-detected `repoos mv` (outside
   a runner session), and the signal all go through the same handoff
   finalization (`handoffTask` in `src/server/handoff.ts`: check → commit gate →
   review). The task stays `active` with a visible "running checks…" state
   until finalization succeeds; on failure it stays `active` with the failure
   shown. No route may reach `review` with only the commit/vacuity gate.
3. **Human override: a confirm modal on the Review button.** Clicking Review
   opens a modal asking whether to **Run checks** (default, the unified path
   above) or **Skip checks** — noting that MTD runs the full check before
   merging anyway. Skip still runs the commit/vacuity gate, moves straight to
   review, and records an activity entry ("review without checks by <user>").
   Use the shared dialog components and `ff-*` form classes (AGENTS.md
   Conventions). Board drag into review should use the same modal. Agents never
   get the skip option.
4. **Never kill the agent that asked.** Moving a task out of `active` must not
   stop an agent that is itself handing off; and any server- or human-initiated
   stop (task left `active`, Stop work) is a deliberate stop — no
   `escalateFailedExit`, no `dev_error_count` bump, no needs-input.
5. **Honest failure detail.** `lastFailureLine()` only returns a line that
   actually describes a failure (stderr, CLI error events, recorded failure
   markers), never an arbitrary progress/`sys` line; otherwise the generic
   message. (#0501 fixed one instance; make it general.)
6. **Docs and prompts match.** AGENTS.md's operating loop and "Who this file is
   for" section say: when ready, run the scoped check, commit, then
   `repoos mv <id> review` (or emit the signal) — RepoOS runs the checks and
   moves the status. Same wording in the engineer prompt and the CTO nudge. Also
   update the `repoos init` AGENTS.md template (`src/commands/init.ts`) and any
   `user-docs/` describing the Review button.

## Acceptance

- Test: `repoos mv <own id> review` from a runner session leaves `status:
  active`, records a handoff request, exits 0, and the runner finalizes it at
  turn end (task reaches review after a green check).
- Test: Review button / PATCH / board drag with "Run checks" go through
  `handoffTask`; a failing check leaves the task `active` with the failure.
- Test: "Skip checks" moves to review after the commit gate only and records
  the activity entry.
- Test: an agent whose task leaves `active` while it runs exits without
  needs_input or a `dev_error_count` bump.
- Test: `lastFailureLine` never returns a plain progress sys line.

## Activity

- 2026-09-26T02:27:03Z · created · unknown
- 2026-09-26T02:39:13Z · title, priority, body
- 2026-09-26T02:54:38Z · status inbox→ready
- 2026-09-26T03:00:32Z · cli_override
- 2026-09-26T03:00:58Z · model_override
- 2026-09-26T03:01:08Z · review_model_override
- 2026-09-26T03:01:13Z · status ready→active, branch
- 2026-09-26T04:31:52Z · note: CTO monitor nudge: task active 88m with no worktree output. No agent process found — only orphaned vitest workers. Please resume work, commit, and hand off to review, or report the blocker.
- 2026-09-26T04:48:50Z · note: ⏰ CTO monitor nudge: 16 minutes idle. Please confirm you're still working or provide a status update.
