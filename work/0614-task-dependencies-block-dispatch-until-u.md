---
id: "0614"
title: "Task dependencies: block dispatch until upstream tasks are merged to main"
type: feature
status: review
priority: p2
area: [core, server, ui-app]
assigned_to: ai
created_by: ""
branch: feat/task-dependencies-block-dispatch-until-u
created_at: "2026-10-01T11:04:57Z"
updated_at: "2026-10-01T14:42:53Z"
review_rounds: 2
review_passes: 2
handoff_signal_retry_count: 1
last_check_failure: "repoos check at 2026-10-01T13:01:23.886Z: server-side finalization timed out (deadline exceeded)"
---
## Problem

Tasks in a story often depend on each other (e.g. Telegram story #0003: phase 4 must not start before phases 1-3 have landed). There is no way to record that, so auto-engineering and manual Start can run a task whose prerequisite code is not on `main` yet, and the branch is cut from a `main` that lacks it.

## Desired UX

- A task can list other tasks it depends on. Dependencies are **merged-only**: satisfied only when the upstream task is `done` AND its branch is an ancestor of `main` (check git, not just the status field; `mv done` can lie, see AGENTS.md).
- A task with unmet dependencies is never dispatched: filtered out of the auto-engineering candidate list before the PM prompt, and blocked on manual Start with a clear reason ("Blocked by #0542") plus an explicit override.
- "Blocked" is **derived**, never stored as a status, so it cannot go stale. When the last dependency merges, the task becomes dispatchable (re-run reconcile on merge).
- Worktrees for dependent tasks are cut from a `main` that already contains the upstream work (falls out of merged-only).
- UI: a "Blocked by #NNNN" chip on task rows (including the story Tasks tab) and the task drawer.
- A cancelled/abandoned upstream shows as a distinct "blocked by a cancelled task, needs a human" state rather than waiting forever.

## Design

- Frontmatter key `depends_on`: a plain list of task ids (`depends_on: ["0542", "0538"]`). No per-dependency options in v1: no `until`, no review/started gates, no stacked branches. A richer object form can be added later if a real need appears; keep the parser tolerant so that is a non-breaking extension.
- Writes go through `repoos new/update --depends-on 0542,0538` and the API (`POST /api/tasks`, `PATCH /api/tasks/:id`). Validate on write: reject unknown ids, self-reference, and cycles.
- This is a task-format change, i.e. self-modifying: the key is optional so existing `work/*.md` need no rewrite, but verify the parser still reads every file in `work/`, and normalize key order on write.
- The PM prompt that decomposes stories should emit `depends_on` when creating ordered tasks.
- Prefer no new config in v1 (otherwise a Settings control is required per AGENTS.md).

## Acceptance criteria

- `depends_on` round-trips through parser, CLI, API and the board payload.
- Cycle / unknown-id / self-reference rejected with clear errors.
- Auto-engineering never selects a task with an unmet dependency; manual Start refuses with a reason and supports an explicit override.
- Satisfaction is verified against git (branch ancestor of `main`), with tests for: unmerged, merged, `done` with unmerged branch, cancelled upstream.
- Merging a dependency makes blocked dependents eligible without a restart.
- UI shows the blocked chip and reason; `user-docs/` and `docs/` updated.

## Out of scope (future)

`until: review|started` gates, stacked branches, `phase:` shorthand, dependency graph view, soft file-overlap conflict hints, non-task gates, cross-repo dependencies.

## Notes for AI

Relevant code: `src/server/auto-engineering.ts` (ready filter), `src/core/types.ts` and `src/core/task.ts` (Task, parser/writer), `ensureWorktree` in `src/core/git.ts`, `src/ui-app` story Tasks tab.

## Shots

```json
[{"target":"default","route":"/work?task=0614","label":"Task drawer dependency status"}]
```

## Activity

- 2026-10-01T11:04:57Z · created · unknown
- 2026-10-01T12:12:15Z · status inbox→ready
- 2026-10-01T12:12:27Z · status ready→active, branch
- 2026-10-01T12:24:23Z · body
- 2026-10-01T12:32:11Z · status active→review
- 2026-10-01T12:33:39Z · status review→active
- 2026-10-01T14:15:44Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-01T14:16:38Z · status active→review
- 2026-10-01T14:16:38Z · status review→active
- 2026-10-01T14:30:00Z · status active→review
- 2026-10-01T14:30:00Z · note: shots: skipped — 1 shot already captured — an engineer-made capture pre-empts the automatic one
- 2026-10-01T14:31:28Z · status review→active
- 2026-10-01T14:42:53Z · status active→review
