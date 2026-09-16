---
id: "0373"
title: "Task worktrees never get .env, breaking this repo's own default preview (auth requires it)"
type: bug
status: inbox
priority: p2
area: server
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-09-16T07:47:49Z"
updated_at: "2026-09-16T07:47:49Z"
---
## Problem

Found while verifying #0370's fix on a genuinely cold worktree. `.env` is
gitignored (secrets, never committed) and `ensureWorktree` (`src/core/git.ts`)
has no logic to copy or symlink it into a new task worktree — confirmed by
grep, zero matches for `.env` handling in that file. `node_modules` gets a
comparable treatment (symlinked from the main checkout in
`syncCandidate`/preview spawn setup) but `.env` does not.

This repo's own `[preview] command` (`repoos.toml`, added in `a44bce4a`) runs
`bun run build && bun dist/cli/index.js serve --port {port} --host {host}`
inside the task's worktree. Since this repo has `auth.enabled = true`, that
`serve` fails immediately:

    Failed to start server: Auth is enabled but no login provider is
    configured. Set [auth.emailProvider] ... or [auth.google] ... in your
    config, or disable auth.

Reproduced directly: `rm -rf dist && bun run build && bun dist/cli/index.js
serve --port N` from inside a real task worktree (no `.env` present) fails
with exactly this error; copying `.env` in (untracked, not committed) fixes
it immediately. This is not specific to #0370's changes — the same failure
would have hit the OLD `ensureFreshBuild`-based special-cased "repoos" preview
path too, since neither path ever copied `.env`. It's a pre-existing gap in
worktree creation, only surfaced now because #0370 made this repo actually
exercise its own default preview command in the field for the first time.

## Scope

This affects THIS repo's own preview specifically (any repo with
`auth.enabled = true` and secrets required at boot would hit the same thing —
Resend API key, Google OAuth secret, etc., all sourced from `.env` per
`docs/native-auth.md`). It does not affect a typical external project with
auth off (the common case per #0341's audit: auth defaults to false).

## Desired outcome

A task worktree needs access to whatever `.env` secrets the main checkout has
so its own preview (or any other worktree-local process depending on them,
e.g. `repoos check`'s steps that touch external services) can actually boot.
Options to weigh — not prescribed, and consider which best matches how
`node_modules` is already handled:
- Symlink `.env` into the worktree the same way `node_modules` is symlinked
  (`syncCandidate` in `src/server/integration-orchestrator.ts` is the
  existing pattern to match, though that's the close-out candidate worktree,
  not every task worktree — check where task worktrees are actually created,
  likely `ensureWorktree` in `src/core/git.ts`).
- Copy `.env` at worktree-creation time instead of symlinking, if a symlink
  risks a task's own process accidentally writing back and corrupting the
  main checkout's secrets file.
- Something else, if either has a real downside (secrets living in a
  worktree that later gets torn down, e.g.) — surface the tradeoff rather
  than picking silently.

## Acceptance criteria

- [ ] A fresh task worktree can run a preview command that depends on secrets
      from the main checkout's `.env` (verify with this repo's own default
      `[preview] command`, on a genuinely fresh worktree, auth enabled).
- [ ] Whatever mechanism is chosen does not risk leaking `.env` into git
      history (it must stay gitignored in the worktree too, if copied rather
      than symlinked).
- [ ] `repoos check` passes.

## Related

- #0370 — the task whose own verification surfaced this; not a regression
  #0370 introduced, a pre-existing gap it exposed.
- Commit `a44bce4a` — this repo's own `[preview] command`, the first thing to
  actually depend on this working.

## Activity

- 2026-09-16T07:47:49Z · created · unknown
