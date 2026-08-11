---
id: "0094"
title: Let RepoOS finalize sandboxed agent worktree handoffs
type: bug
status: active
priority: p1
area: agent
assigned_to: ai
created_by: ""
branch: feat/let-repoos-finalize-sandboxed-agent-work
cli_override: codex
model_override: gpt-5.6-sol
created_at: "2026-08-11T14:42:54Z"
updated_at: "2026-08-11T20:10:25Z"
---
## Activity

- 2026-08-11T14:42:54Z · created · unknown
- 2026-08-11T14:45:55Z · updated · specify RepoOS-owned sandbox handoff
- 2026-08-11T14:47:51Z · updated · make API-first privilege separation explicit
- 2026-08-11T15:37:46Z · updated · sequence behind active runner-orchestration work


## Problem

RepoOS launches Codex engineers with `--sandbox workspace-write` and the task
worktree as their working directory. In a linked Git worktree, `.git` is a file
that points into the main repository's `.git/worktrees/<name>/` directory.
Codex can therefore edit and test the implementation, but it cannot create the
Git index lock, write objects/refs, or commit because that Git metadata is
outside its writable sandbox root.

The handoff mission also asks the engineer to update the canonical task copy in
the main checkout's `work/` directory. That directory is outside the worktree
sandbox too. Codex runs non-interactively, so an approval prompt cannot rescue
either operation. Task 0029 demonstrated the failure: the implementation and
`repoos check` were complete, but the agent reported itself blocked at the
commit/status-handoff step.

This is a Codex driver/sandbox integration bug, not a model-quality issue. It
will recur for any Codex-backed task using a linked worktree. Granting the agent
write access to the repository's shared Git internals would work, but it would
unnecessarily weaken the security boundary.

## Desired UX

A Codex engineer working in a RepoOS-managed linked worktree can implement and
test without receiving access to shared Git metadata or the main checkout. It
then signals that the work is ready for handoff. The trusted RepoOS server
validates and finalizes the handoff: it runs the required checks, commits the
worktree changes, records `status: review` on the branch, and updates the
canonical task through RepoOS's own write/API layer.

The UI/transcript clearly distinguishes agent work from server-side handoff
finalization and reports any actionable failure without falsely marking the
task blocked for an agent permission it should never need.

As a general architectural rule, agent workflows should request privileged
RepoOS operations through narrow, validated RepoOS APIs. Expanding an agent's
filesystem, Git, or process permissions is an exceptional fallback only when no
appropriate RepoOS operation can exist.

## Acceptance criteria

- [ ] Add one trusted, task-scoped handoff operation in the RepoOS server/API
      layer; reuse it for initial and resumed agent runs.
- [ ] Document and preserve the API-first boundary: agents express intent and
      RepoOS performs privileged repository mutations after validation.
- [ ] The handoff validates the task id, active run/session, expected worktree,
      and expected branch before changing files or Git state.
- [ ] RepoOS runs `repoos check` in the task worktree and refuses to move the
      task to `review` if it fails.
- [ ] On success, RepoOS commits all intended implementation changes and the
      worktree task's `status: review`, then updates the canonical main-checkout
      task using the existing guarded task-write path.
- [ ] The operation is idempotent so a retry or process restart cannot create
      duplicate commits or corrupt task state.
- [ ] Handoff progress and failures appear in the retained transcript/UI, and a
      finalization failure remains recoverable on the same worktree.
- [ ] The agent does not receive write access to the main checkout or Git common
      directory and does not use `danger-full-access` or sandbox bypass flags.
- [ ] If the agent must initiate handoff directly, use a task/run-scoped
      capability and loopback-only transport. Prefer a structured runner signal
      that requires no extra agent network access.
- [ ] Normal non-worktree Codex runs continue to work.
- [ ] Automated tests cover successful, failed-check, invalid-session,
      interrupted, and repeated linked-worktree handoffs.
- [ ] `repoos check` passes.

## Notes for AI

- The current mission in `src/server/agents.ts` incorrectly assigns `git
  add`/`commit` and the main-checkout edit to the sandboxed agent. Replace those
  steps with a structured ready-for-handoff signal.
- `PATCH /api/tasks/:id`, `patchTaskFile`, and `commitTaskFile` already provide
  guarded canonical task updates. Reuse this logic rather than inventing a
  second task-file writer.
- Keep the privileged Git actions inside RepoOS's server/runner process and
  constrain them to the registered worktree and branch.
- Prefer adding a narrow RepoOS API operation whenever a future agent workflow
  needs privileges beyond its task workspace. Do not add agent-specific
  permission exceptions merely to bypass an orchestration gap.
- Do not expose a general command-execution API. Do not solve this by weakening
  the Codex sandbox globally.
- Likely implementation areas are `src/server/agents.ts`, `src/server/server.ts`,
  and a small handoff orchestration module comparable to `src/server/done.ts`.
  Test areas include `src/ui-app/tests/agent-drivers.test.ts`, server route
  tests, and existing Git worktree tests.
- Coordinate with active tasks 0096 and 0097 before implementation because all
  three touch runner orchestration and structured server-side operations. Land
  this after their contracts settle rather than creating parallel handoff APIs.

## Related

- 0029 — failure observed during its completed implementation handoff
- 0041 — task worktree support
- 0067 — canonical task state across the main checkout and worktree
- 0096 — managed task-specific previews and runner lifecycle changes (active)
- 0097 — cached context packs and agent bootstrap changes (active)

## Activity

- 2026-08-11T19:41:42Z · status inbox→ready
- 2026-08-11T19:43:27Z · model_override
- 2026-08-11T19:43:34Z · status ready→active, branch
- 2026-08-11T19:58:20Z · cli_override, model_override
- 2026-08-11T19:58:45Z · status active→ready
- 2026-08-11T19:58:53Z · status ready→active
