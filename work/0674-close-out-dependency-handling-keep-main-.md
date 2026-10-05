---
id: "0674"
title: "Close-out dependency handling: keep main's install fresh and stop mislabelling environment errors"
type: bug
status: inbox
priority: p1
area: server
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-10-05T16:58:30Z"
updated_at: "2026-10-05T16:58:30Z"
---
## Problem

Close-out candidates reuse the main checkout's root `node_modules` through a symlink (documented in docs/close-out-pipeline.md). A candidate only gets its own `bun install --frozen-lockfile` when the BRANCH changes package inputs (#0449). Nothing refreshes main's install after a dependency-changing merge lands, and per-package `node_modules` (Bun's default for workspaces) are never visible through the root symlink. Observed in one project, three different failures from this one mechanism, each reported as "a real failure in the branch ... not machine load":
1. `Could not resolve "hono"/"@opex/shared"` (stale main install + Bun workspace layout; exit 127).
2. `Rolldown failed to resolve import "maplibre-gl/..."`: task A added a dependency and merged; task B's candidate used main's stale tree.
3. Vitest `Denied ID <real path>/node_modules/...?worker&url`: the symlink target is outside the candidate root, so Vite's fs guard refuses it.
All were invisible to the engineer, whose own worktree has a real install.
RepoOS itself rarely trips this (single package, zero-runtime-deps rule), so it looks solved; for ordinary apps with workspaces it is constant.

## Desired UX

A task that passes in its own worktree does not fail close-out for environment reasons, and when an environment error does happen the message says so and suggests the fix.

- After a merge whose diff changes package inputs, RepoOS refreshes the install in main (inferred from the lockfile, reusing the #0449 code), or the project can set `closeOut.postPublishCommand`.
- Per-project control of candidate preparation: `[worktrees]`/`[closeOut]` `candidate = "own-install" | "symlink-main"` and an optional `installCommand` for non-JS stacks (Python venv, Go modules, Cargo...).
- Classify failures: exit 127 / unresolved imports / `Denied ID` / missing binaries are `environment` failures, not "real failure in the branch"; offer a one-click "refresh install and retry".

## Acceptance criteria

- Reproduction test: a workspace repo where task 1 adds a dependency and task 2 (cut earlier) builds after task 1 merges; close-out for task 2 passes without manual `bun install`.
- Test for the error classification and for the new config keys; docs in docs/close-out-pipeline.md and user-docs/configuration.md.
- `repoos check` passes.

See also: the per-task "dependency-changing merge" logic at `hasDependencyInputChange` in src/server/integration-orchestrator.ts.

## Notes for AI

Evidence comes from building a real 30-task project (opex, a Vue + Bun + Postgres app) with cheap agents on one laptop over ~9 hours. Read `AGENTS.md` first. Never hand-edit work/*.md; use RepoOS commands or APIs. Verify any claim you rely on against the current source before changing behaviour. Where a related task exists it is listed under "See also"; coordinate rather than duplicate.

## Activity

- 2026-10-05T16:58:30Z · created · unknown
