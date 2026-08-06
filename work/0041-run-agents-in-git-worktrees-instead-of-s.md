---
id: "0041"
title: Run agents in git worktrees instead of switching the working branch
type: refactor
status: review
priority: p2
area: core
assigned_to: ai
created_by: ""
branch: feat/0041-git-worktrees
created_at: "2026-08-06T11:00:00Z"
updated_at: "2026-08-06T11:20:15Z"
---
## Activity

- 2026-08-06T11:00:00Z · created · unknown
- 2026-08-06T11:08:11Z · status inbox→ready
- 2026-08-06T11:08:11Z · status ready→active · branch feat/0041-git-worktrees

## Problem

0037's Start work mechanic calls `ensureBranch` before spawning the agent:
it runs `git checkout -b/-` on the ONE shared working tree — the same tree the
server and the user operate in. Launching a task yanks the repo onto the task's
branch, which is exactly the disruption that makes Start work risky on a
self-hosted repo (uncommitted local edits like `repoos.toml` ride along, the
current task's branch gets checked out from under you, and two started tasks
cannot run in parallel — the second checkout clobbers the first). Git worktrees
solve this by giving each running agent its own working directory on its own
branch while the main worktree stays exactly where the user left it.

## Desired UX

- Clicking **Start work** leaves the repo's checked-out branch untouched
  (`git branch --show-current` in the repo root is unchanged).
- Each started task gets its own worktree directory; the agent's `cwd` is that
  worktree, not the repo root.
- Restarting a paused task reuses the same worktree instead of piling up
  duplicates.
- Pausing kills the agent as today (SIGTERM → SIGKILL); the worktree persists
  so the task's uncommitted work survives and can be resumed or reviewed.
- Two tasks started at once work in parallel without interfering.

## Scope

- **git layer** (`src/core/git.ts`): replace the branch-switching
  `ensureBranch` with a worktree-aware helper built on
  `git worktree list` / `git worktree add`. If the task's branch doesn't exist,
  create it; if a worktree for that branch already exists, reuse it; else add a
  new worktree. Fail-soft like the current helper (`{ ok, reason }`).
- **Worktree location**: stable across server restarts so a later pause/resume
  can find the agent's tree. A sibling directory of the repo root (e.g.
  `<repo-basename>-worktrees/<branch>`) keeps everything discoverable; make the
  location a constant in `src/core/config.ts` (or a repoos.toml field) rather
  than scattering magic paths. Never inside the repo root (would break `repoos
  check` staleness and git itself).
- **Agent runner** (`src/server/agents.ts`): `start()` spawns with `cwd` =
  the task's worktree path instead of `config.root`. The running registry keeps
  the worktree path alongside the pid so `pause`/cleanup stay coherent.
- **Task fields**: the `branch:` frontmatter field keeps its meaning (worktrees
  are per-branch), so task files, the "branch exists" dot, and the drawer's
  branch display are unchanged.
- **Launch mission**: the mission prompt already references the branch; adjust
  it to mention the agent works in its own worktree directory (and that
  dependencies/build artifacts live there — see Notes).
- **UI**: no changes expected — buttons, running marker, and SSE events are
  untouched by this swap.
- **Out of scope**: pruning/removing worktrees when a task lands (`done`),
  streaming output, auto-commit/merge. Those stay separate tasks.

## Acceptance criteria

- [ ] Starting a task no longer changes the repo root's checked-out branch
- [ ] Each started task has its own worktree; the agent process `cwd` is inside
      it
- [ ] Pausing kills the agent and returns the task to `ready`; the worktree is
      preserved and a subsequent Start reuses it (no duplicate worktrees)
- [ ] Two ready tasks can be started concurrently without interfering
- [ ] Missing git / failed worktree creation degrades gracefully (task still
      transitions, spawn still fails soft — no server crash), matching 0037's
      best-effort contract
- [ ] `repoos check` passes

## Notes for AI

- **Depends on 0037** (already merged): the spawn/registry/SSE/UI layer stays;
  only *where the agent works* changes. Keep the mission prompt aligned with the
  repo's AGENTS.md operating loop.
- **Self-hosted caveat**: this repo is RepoOS. An agent in a worktree needs its
  own `node_modules` and a build to run `repoos check` in that tree. Decide and
  document how that's provisioned — symlinking the root's `node_modules` is
  fragile; a bootstrap step (or sharing via a documented convention) belongs in
  the mission prompt or the worktree setup. At minimum, do not make the main
  worktree dirty to provision one.
- **`repoos check` staleness**: a fresh worktree's build state is independent of
  the root's; the mission prompt should tell the agent to build before relying
  on `repoos` (or accept the staleness warning).
- **Parallel worktrees**: verify the branch-creation race — two starts on the
  same branch (different tasks should never share a branch, but guard anyway)
  must not both create the branch/worktree.

## Related

- 0037 built the launch mechanics this task re-homes to worktrees. 0040
  (drag-to-move status) is independent UI. When worktrees land, the Start work
  caveat from 0037 (branch-switch disruption) goes away.

## Activity

- 2026-08-06T11:08:10Z · status inbox→ready
- 2026-08-06T11:08:11Z · status ready→active
- 2026-08-06T11:20:15Z · status active→review · implementation on feat/0041-git-worktrees (ae94171): ensureWorktree replaces ensureBranch (`git worktree list/add`, branch==checkout → work in root, reuse existing, realpath-normalized), AgentRunner spawns with cwd = worktree path (registry carries workdir), mission names the worktree + build-before-repoos note, 5 new git-worktree unit tests; repoos check green + fixture E2E (parallel starts, reuse, pause-kill, branch untouched)
