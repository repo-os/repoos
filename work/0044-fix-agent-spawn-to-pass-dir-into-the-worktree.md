---
id: "0044"
title: Fix agent spawn to force --dir into the worktree
type: bug
status: review
priority: p1
area: core
assigned_to: ai
created_by: ""
branch: feat/0044-agent-spawn-worktree-dir
created_at: "2026-08-06T14:15:00Z"
updated_at: "2026-08-06T14:47:00Z"
---
## Activity

- 2026-08-06T14:15:00Z · created · ai

## Problem

0041 spawns the coding agent in a linked git worktree (passed as the child
process `cwd`), but opencode re-resolves the project directory itself and
treats any linked worktree as part of the MAIN repo:

- `git rev-parse --git-common-dir` in a linked worktree returns the main
  repo's `.git` (e.g. `/path/to/repoos/.git`), and opencode derives the
  project root from that → the session logs `directory=<repo root>` even
  though it was spawned with `cwd=<worktree>`.
- Every path under the worktree is then classified as `external_directory`,
  which is auto-rejected in headless `run` mode (no interactive prompt). The
  agent fails instantly: `Read work/<task>.md` and `git branch --show-current`
  both error with "The user rejected permission".

Observed on Start work for #0036: the worktree was created and the agent
launched, but it could not read anything and failed.

`opencode run --dir <absolute-path>` forces the project directory explicitly
and sidesteps the git-common-dir resolution. Verified manually: with
`--dir <worktree>` the session resolves the worktree and `Read`/`git` work
fine.

## Desired fix

- `src/server/agents.ts`:
  - `cliCommand(cli, mission, cwd)` — for the opencode path, emit
    `["run", "--dir", cwd, mission]` (claude code unchanged).
  - `resumeCommand(cli, text, sessionId, cwd)` — same for the resume path
    (`["run", "--session", id, "--dir", cwd, text]` / plain `--dir`).
  - `start()` and `send()` pass the working directory they already compute.
- The `cwd` passed to `spawn` stays as-is (both are the worktree path).
- No behavior change for non-worktree tasks (the main-checkout case: `--dir`
  is the same directory as the spawn cwd).

## Acceptance criteria

- [ ] `repoos check` passes
- [ ] Spawning a task whose branch has a linked worktree: the spawned
      opencode run's session `directory` is the worktree path, and the agent
      can read the task file without `external_directory` auto-rejects
- [ ] Follow-up turns (resume) also force `--dir`

## Activity

- 2026-08-06T14:47:00Z · status ready→review
