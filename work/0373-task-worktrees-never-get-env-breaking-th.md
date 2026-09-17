---
id: "0373"
title: "Task worktrees never get .env, breaking this repo's own default preview (auth requires it)"
type: bug
status: done
priority: p2
area: server
assigned_to: ai
created_by: ""
branch: feat/task-worktrees-never-get-env-breaking-th
created_at: "2026-09-16T07:47:49Z"
updated_at: "2026-09-17T13:47:55Z"
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
`serve` fails immediately — it does not "work fine without .env," it does not
start at all:

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

Worth being precise about the two config layers here, since they're easy to
conflate: `repoos.toml` (git-tracked) holds the *declaration* — `auth.enabled
= true` — and it already propagates to every worktree fine, since it's
committed. `.env` (gitignored) holds the *secret* that declaration requires
(the Resend API key). The gap is specifically about secrets, not config.

## Scope

This affects THIS repo's own preview specifically (any repo with
`auth.enabled = true` and secrets required at boot would hit the same thing —
Resend API key, Google OAuth secret, etc., all sourced from `.env` per
`docs/native-auth.md`). It does not affect a typical external project with
auth off (the common case per #0341's audit: auth defaults to false) or any
project whose build/preview command genuinely doesn't need secrets.

## Decision needed first: opt-in, not automatic (2026-09-16 discussion)

Before picking a mechanism, settle whether ANY worktree should get `.env` by
default. Leaning **opt-in**, not "always copy it in the same way
`node_modules` is symlinked" — the `node_modules` precedent doesn't transfer
cleanly:

- **Most projects don't need `.env` in a worktree at all.** Copying it
  unconditionally means every task worktree for every project carries a copy
  of secrets it will never use — pure downside (see next point), no benefit,
  for what's likely the common case.
- **Blast radius.** Every worktree is a new place secrets physically live on
  disk — more copies is more surface area if a worktree gets zipped up, handed
  to a sandboxed agent environment, or just left around after a task closes
  out. `node_modules` is huge-but-disposable; secrets are neither.
- So: a project that knows its build/preview genuinely needs secrets (this
  repo, via its own `[preview] command`) should say so explicitly — a
  `repoos.toml` flag (e.g. `worktrees.inheritEnv = true`, naming not
  prescribed) that `ensureWorktree` checks before doing anything with `.env`.
  Silence/absence means no `.env` in worktrees, same as today.

Report back if investigation finds a reason this repo-level opt-in isn't
enough (e.g. some worktrees need it and others in the same repo don't) rather
than assuming a single project-wide flag is sufficient — but start from that
as the working design.

## Desired outcome

Once the opt-in question above is settled, a task worktree in a project that
opted in gets access to the main checkout's `.env` so its own preview (or any
other worktree-local process depending on those secrets) can actually boot.
Mechanism options to weigh, contingent on the opt-in design:
- Symlink `.env` into the worktree the same way `node_modules` is symlinked
  (`syncCandidate` in `src/server/integration-orchestrator.ts` is the
  existing pattern to reference, though that's the close-out candidate
  worktree, not every task worktree — check where task worktrees are
  actually created, likely `ensureWorktree` in `src/core/git.ts`).
- Copy `.env` at worktree-creation time instead of symlinking, if a symlink
  risks a task's own process accidentally writing back and corrupting the
  main checkout's secrets file.
- Something else, if either has a real downside (secrets living in a
  worktree that later gets torn down, e.g.) — surface the tradeoff rather
  than picking silently.

## Acceptance criteria

- [ ] A repo can opt in (config flag, not automatic) to its task worktrees
      having access to the main checkout's `.env`.
- [ ] With opt-in enabled, a fresh task worktree can run a preview command
      that depends on `.env` secrets (verify with this repo's own default
      `[preview] command`, on a genuinely fresh worktree, auth enabled) —
      set this repo's own `repoos.toml` to opt in as part of this task.
- [ ] Without opt-in (the default), worktree behavior is unchanged from
      today — no `.env` copied, no new failure mode introduced for the
      common case.
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
- 2026-09-16T07:50:59Z · body
- 2026-09-16T17:04:30Z · status inbox→ready
- 2026-09-17T11:43:52Z · status ready→active, branch
- 2026-09-17T11:50:49Z · status active→review
- 2026-09-17T13:47:55Z · status review→done, release:success
