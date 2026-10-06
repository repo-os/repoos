---
id: "0674"
title: "Close-out dependency handling: keep main's install fresh and stop mislabelling environment errors"
type: bug
status: review
priority: p1
area: server
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: feat/close-out-dependency-handling-keep-main-
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-05T16:58:30Z"
updated_at: "2026-10-06T01:16:45Z"
review_rounds: 1
review_passes: 1
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

## Story context
This task is part of the story **Field report: first agent-driven project run (opex)** (story #0008, `stories/field-report-first-agent-driven-project-run-opex.md` in this repo). Read that file first: it holds the background of the run that produced this task, the facts already established for your theme (with the evidence), the decisions the owner has already made, the known uncertainties, and the list of sibling tasks you should coordinate with. Verify its facts against the current source before relying on them, and say in the task notes if you find anything in it that is wrong or out of date.

## Docs follow-up
The playbook page `user-docs/running-with-agents.md` (landed on main) describes the CURRENT behaviour that this task changes. When this task lands, update the page: section 3, the bullet about installing dependencies in the primary checkout after a lockfile-changing merge. In short: drop or soften it once close-out refreshes the install itself. Keep the page accurate rather than aspirational; if this task is declined, leave the page as is. (This replaces the open task 0689, which is being removed.)

## Activity

- 2026-10-05T16:58:30Z · created · unknown
- 2026-10-05T17:16:40Z · story
- 2026-10-05T17:16:42Z · body: section Story context
- 2026-10-05T17:32:18Z · body: section Docs follow-up
- 2026-10-05T23:44:51Z · status inbox→ready
- 2026-10-05T23:44:53Z · cli_override, model_override
- 2026-10-05T23:44:53Z · status ready→active, branch
- 2026-10-06T00:49:45Z · status active→review
- 2026-10-06T00:50:33Z · status review→active
- 2026-10-06T01:16:45Z · status active→review
