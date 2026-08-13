---
id: "0156"
title: "Watchdog for stuck active tasks: retry handoff, then escalate to human"
type: feature
status: review
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: feat/watchdog-for-stuck-active-tasks-retry-ha
cli_override: opencode
model_override: opencode/big-pickle
created_at: "2026-08-13T06:47:22Z"
updated_at: "2026-08-13T09:39:45Z"
---
## Activity

- 2026-08-13T06:47:22Z · created · unknown


## Problem

The close-out pipeline only fires when an agent's turn ends with *both*: (1) its final
line, trimmed, exactly equals `HANDOFF_READY_SIGNAL` (`::repoos-handoff-ready::`), and
(2) the process exited cleanly (`agents.ts:2195`). If either condition fails — the
agent crashes, times out, gets manually stopped, or its CLI mangles the signal line
(the kiro rendering bug behind #0154/#0155 is one concrete way this happens) — the
turn just ends. Nothing else happens: no error is written to the task file, nothing
retries it, and no watchdog notices. The task sits in `active` forever, indistinguishable
in the UI from one that's genuinely still being worked, except no process is actually
running.

Found by inspecting three real stuck tasks on this board (#0024, #0105, #0150): each
transitioned to `active` and then has **zero** Activity entries since — but each
worktree has real uncommitted work (0 commits ahead of main, dirty). The agents did
real work and never got to commit or hand off.

Compounding this: whatever diagnostic the runner *does* emit on a failed handoff
(e.g. `✗ handoff was not started because the agent turn was interrupted`,
`agents.ts:2211`) only ever reaches the live in-memory transcript (SSE), never the
task file's persisted `## Activity` log. Any auto-reload (see `server/reload.ts`)
wipes that transcript, so after a restart there is no way to know why a given task
died.

## Desired UX

A background watchdog that periodically scans for tasks stuck in `active` with no
live agent process and no activity for some threshold (e.g. a few minutes past the
stall-timeout window used elsewhere, `DEFAULT_STALL_TIMEOUT_MS` in `agents.ts`):

1. First attempt: automatically resume the task's own session in its existing
   worktree (same mechanism `POST /api/tasks/:id/message` already uses — see
   `runner.send` at `server.ts:1716`) with a nudge message along the lines of
   "finish up and emit the handoff signal `::repoos-handoff-ready::` when ready, or
   explain what's blocking you."
2. If that resume also ends without a proper handoff (still no signal, or it fails
   again), don't retry forever — cap retries (e.g. 1–2 attempts), then escalate:
   set the existing `needsInput` flag on the task (`core/types.ts:73`) so it
   surfaces on the board and fires the existing `notifyNeedsInput` notification
   (`server/ntfy.ts:97`) — no new "needs human attention" concept required, reuse
   what's there.
3. When escalating, include a suggested next step if one can be inferred: check the
   captured failure reason (once persisted — see Acceptance criteria) against known
   patterns — e.g. an existing skill/best-practice doc under `skills/` or `docs/`
   that matches the failure shape (rendering/ANSI issues, timeout, permission
   prompt hang, etc.) — and reference it in the escalation note. Keep this
   best-effort: a generic "stuck, needs a look" beats a wrong diagnosis.

## Acceptance criteria

- [ ] The handoff-failure reason (interrupted turn, missing signal, timeout, etc.)
      is persisted into the task file's own `## Activity` log, not just the
      in-memory transcript, so it survives a server reload.
- [ ] A watchdog process detects an `active` task with no running agent
      (`runner.isRunning(id)` false) and no activity past a defined staleness
      threshold.
- [ ] On detection, the watchdog sends exactly one automatic resume/nudge message
      (reusing the existing send-message path) asking the agent to finish and emit
      the handoff signal, or explain the blocker.
- [ ] If the retried turn still doesn't produce a clean handoff, the watchdog stops
      retrying (bounded — never an infinite loop re-spawning the same agent), sets
      `needsInput: true`, and the existing needs-input notification fires.
- [ ] The escalation note on the task includes the captured failure reason, and a
      suggested fix/skill reference when one can be matched.
- [ ] Covered by a test that simulates a dead-process/no-activity task and asserts:
      one resume attempt, then escalation — not silent, not an infinite retry loop.

## Notes for AI

- This task's board-inspection method for finding stuck tasks: task `status ==
  active`, `runner.isRunning(id) === false`, and no `## Activity` entries after the
  most recent `status →active` transition. Use the same detection query for the
  watchdog.
- Don't build a new "needs human" flag — `needsInput` (`core/types.ts:73`) and
  `notifyNeedsInput` (`server/ntfy.ts:97`) already exist for exactly this purpose.
- The resume path already exists and is exercised today via the task chat: see
  `runner.send` usage at `server.ts:1716`, including the `resumePreamble` built from
  `resumePreamble()` in `core/context-pack.ts` so the agent sees its own partial
  worktree changes without rediscovering them from scratch. Reuse it rather than
  building a second resume mechanism.
- Related: #0155 (kiro output rendering breaks exact-signal matching) is one root
  cause of a missed handoff signal, but this task is about the *safety net* for ANY
  cause (crash, timeout, stop, malformed signal) — don't make this depend on #0155
  landing first.
- **Correction (2026-08-13):** #0151 hit a *different* stuck-active failure that
  looked identical from the board (active, unreachable finalization) but had a
  distinct root cause: `ensureWorktree` cutting/reusing a worktree whose branch
  never contained the task's own file (confirmed via `git ls-tree` on the
  branch — the file's creation commit hadn't landed on `main` yet when the
  worktree was cut, and once cut, reuse never re-checked freshness). That is now
  self-healed in `ensureWorktree` (`src/core/git.ts`) — a resolved worktree
  missing the task's own file gets it copied in and committed automatically, so
  a stuck task heals itself on the next `/start` retry, no watchdog needed. Do
  NOT fold "check for the missing task file" into this watchdog's detection —
  it's already handled at a lower layer. This watchdog's actual scope (dead/no
  running process, no activity, real uncommitted worktree changes) is a
  genuinely separate condition; #0024/#0105/#0150 above are still valid
  evidence for THIS bug, not #0151's.

## Activity

- 2026-08-13T07:09:52Z · status inbox→ready
- 2026-08-13T07:09:56Z · status ready→active, branch
- 2026-08-13T08:06:36Z · body
- 2026-08-13T09:17:20Z · cli_override, model_override
- 2026-08-13T09:18:11Z · cli_override, model_override
- 2026-08-13T09:18:41Z · cli_override, model_override
- 2026-08-13T09:18:48Z · cli_override, model_override
- 2026-08-13T09:19:35Z · model_override
- 2026-08-13T09:39:45Z · status active→review
