---
id: "0077"
title: Harden the review-status readback so it can't false-positive from inside a worktree
type: bug
status: review
priority: p1
area: core
assigned_to: ai
created_by: ""
branch: feat/harden-the-review-status-readback-so-it-
created_at: "2026-08-11T05:20:16Z"
updated_at: "2026-08-11T06:37:01Z"
---
## Activity

- 2026-08-11T05:20:16Z · created · unknown
- 2026-08-11T05:24:19Z · status inbox→ready


## Problem

`missionFor()` in `src/server/agents.ts` gives every implementing agent a
7-step fail-safe checklist (added by #0067) ending with: edit the
main-checkout copy of the task file to `status: review` (uncommitted), then
**read that main-checkout copy back to confirm it stuck** before stopping.
The intent is that the live board updates immediately without needing a
merge, and the agent self-corrects if the edit didn't land.

It doesn't work reliably. Root cause, confirmed live on `#0068` ("Add
Cloudflare Tunnel + Zero Trust publishing"): the agent did the readback with
`repoos show 0068` instead of literally reading the file content. `repoos`
resolves its own repo root via `findRepoRoot()` (`src/core/config.ts:81`),
which walks up from `process.cwd()` looking for the nearest `.git` or
`repoos.toml`. A git worktree has its own `.git` **file** (pointing at
`.git/worktrees/<name>` in the main repo) — `findRepoRoot` doesn't
distinguish that from a real repo root, so `repoos show`/`list`/`index` run
from inside a task's worktree (which is exactly where the agent's shell
lives) silently resolve to the **worktree's own root**, not the main
checkout. The readback showed `review` — correctly, since the worktree copy
really was committed to `review` — but it was reading the wrong copy. The
agent took that as confirmation, stopped, and the main checkout's copy sat
at `active` indefinitely with zero diff, zero commits after the fact. The
task's actual work was 100% done and correctly committed on its branch; only
the board-visibility step silently failed.

This isn't a one-off prompt-following slip — it's a structural false-positive
any agent will hit if it uses the natural, idiomatic tool (`repoos show`) for
the readback instead of reading a raw file path. The checklist's step 6
("repeat step 5 until it does") can never trigger, because the wrong-root
read always appears to succeed.

## Desired UX

- An agent's review-status readback cannot be fooled by running from inside
  a worktree — it either reads the real main-checkout file directly (no CLI
  indirection to get it wrong), or `repoos` itself refuses to silently
  resolve to a worktree root when the caller's intent is main-checkout state.
- Defense in depth: even if an agent's own checklist step is skipped or
  fails for some other reason in the future, the board should not be able to
  silently drift from a worktree branch that has already reached `review` (or
  `needs_input`) — the class of bug that stranded `#0068` in `active` with no
  human-visible signal should not be able to recur silently.

## Acceptance criteria

- [ ] `missionFor()`'s step 5/6 readback instruction no longer suggests or
      allows using `repoos show`/`list`/`index` for the main-checkout
      verification — it should tell the agent to read the literal file path
      (`task.path`, already given to it) directly, e.g. `cat` or its Read
      tool, not the CLI.
- [ ] `findRepoRoot` (or a new helper) can distinguish "inside a linked
      worktree" from "at a real repo root" (a worktree's `.git` is a file
      containing `gitdir: ...`, not a directory) — a quick, cheap check.
      Reasonable options, pick one and justify in the PR: (a) have `repoos`
      commands that read board state resolve through to the MAIN checkout
      even when invoked from a worktree, or (b) print a loud, unmissable
      warning (not buried in normal output) when `repoos show`/`list` is run
      from inside a worktree, making clear the result may not reflect the
      live board. Do not silently change behavior with no signal either way.
- [ ] Defense-in-depth: when an agent's turn ends (process exit) and the
      main-checkout task is still `active` but its worktree copy shows
      `review` or `needs_input` with a real commit backing it, the server
      (`AgentRunner` in `src/server/agents.ts`, near wherever it detects
      process exit) detects the divergence and self-heals — patch the
      main-checkout copy to match. Log or surface that this correction
      happened (it indicates the checklist itself failed and is worth
      knowing about, not just silently papering over it).
- [ ] A regression test reproducing the `#0068` shape: worktree copy at
      `review` with a real commit, main copy still `active`, assert the
      self-heal (or whatever mechanism you land on) brings main in sync
      without a human noticing anything was ever wrong.
- [ ] `repoos check` passes; verify with a real agent turn against a running
      `repoos serve`, not just unit tests.

## Notes for AI

- Files to touch: `src/server/agents.ts` (`missionFor()`, and wherever the
  runner handles process exit / turn completion), `src/core/config.ts`
  (`findRepoRoot`), possibly `src/core/git.ts` if a "is this a linked
  worktree" helper belongs there instead. Read `missionFor()`'s current
  7-step checklist in full before changing it — don't regress the other
  steps (needs_input signaling, "leave the worktree open", etc.), which work
  correctly today.
- Concrete repro to verify your fix against: `cd` into any task worktree
  under `repoos-worktrees/`, run `repoos show <id>`, and confirm it now
  either resolves to the main checkout's copy or loudly says it isn't.
- Don't touch the done-flow (`src/server/done.ts`) or the move-to-done
  request/response lifecycle — that's #0075's scope, independent of this.
  Don't touch merge/conflict semantics — that's #0069's scope.
- Keep the self-heal narrowly scoped to the `active`-but-worktree-shows-
  `review`/`needs_input` divergence. Don't build a general bidirectional
  sync between worktree and main task-file copies — that's a much bigger
  surface (concurrent edits, conflicting fields) and out of scope here.

## Related

- 0067 · Signal when a task is waiting on the human and make the agent
  mission a fail-safe checklist — introduced the readback step this hardens.
- 0068 · Add Cloudflare Tunnel + Zero Trust publishing — the concrete
  incident this task is written from; its worktree/branch already has the
  real, correct, committed work — nothing to redo there.

## Activity

- 2026-08-11T05:29:28Z · status ready→active, branch
- 2026-08-11T06:12:10Z · status active→ready
- 2026-08-11T06:12:12Z · status ready→active
- 2026-08-11T06:36:48Z · status active→ready
- 2026-08-11T06:37:01Z · status ready→active
