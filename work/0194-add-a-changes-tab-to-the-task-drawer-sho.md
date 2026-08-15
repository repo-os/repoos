---
id: "0194"
title: Add a Changes tab to the task drawer showing the full code diff
type: feature
status: ready
priority: p2
area: ui-app
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-14T12:06:16Z"
updated_at: "2026-08-15T02:41:38Z"
---
## Problem

The task drawer already surfaces a coarse summary of a task's code changes: the Task tab shows a "Code changes" panel with diff **stats** only (files changed, +additions / −deletions), powered by `GET /api/tasks/:id/diff-stats` → `getDiffStats` (`src/core/git.ts:382`). That tells you *how much* changed but not *what* changed.

To review or diagnose an implementation you have to leave the drawer and diff the worktree by hand. There's no way to see the actual patch — the files touched, the hunks added or removed — inline in the task UI. With no per-file breakdown and no hunks, reviewers can't appraise a branch, and an implementer can't quickly confirm their work landed correctly.

## Desired UX

Add a new **Changes** tab to the task drawer (alongside Task / PM / Engineer / Reviewer) that shows the **full code diff** for the task's branch against `main`, rendered read-only with line-level +/- highlighting. It should show the shift-space intro state, the per-file patch (path header, hunk headers, added/removed lines), and inline guidance when there is nothing to show.

The tab must:

- Fetch the full patch for the task's worktree vs `main` via a new backend endpoint (e.g. `GET /api/tasks/:id/diff`).
- Render added lines with a green tint and `+` prefix, removed lines red with `-` prefix, and context/hunk headers in a neutral muted style.
- Group the diff by file with a per-file header showing the path and file-level +/− counts.
- Show a clear empty state when the task has no branch, no worktree, or no committed changes yet (e.g. "No code changes yet"), mirroring the wording already used in the Task tab (`src/ui-app/src/components/TaskDrawer.vue:1894`).
- Keep the existing diff **stats** panel in the Task tab as-is; the new tab is additive, not a replacement.

## Acceptance criteria

- [ ] A new "Changes" tab appears in the task drawer tab bar for tasks, in a sensible order.
- [ ] Selecting the tab fetches and renders the full diff (git patch) of the task's worktree against `main`, not just stats.
- [ ] Diff output is syntax-colored by line operation: added lines green/`+`, removed lines red/`-`.
- [ ] The diff is grouped by file with per-file path headers and +/− counts.
- [ ] Empty/no-change states are clearly handled (no branch / no worktree / nothing committed) with a friendly message, no console errors.
- [ ] Works for tasks in `active` and `review` states where a branch/worktree exists; gracefully degrades when they don't.
- [ ] New backend endpoint returns the raw patch safely (bounded size, no shell injection).
- [ ] `repoos check` passes (build, typecheck, tests, UI smoke test).

## Notes for AI

- Reuse the existing worktree/branch plumbing. `getDiffStats` (`src/core/git.ts:382`) shows the pattern: resolve `worktreePathForBranch(config.root, task.branch)`, compute `merge-base main HEAD`, then diff. Add a sibling that returns the full patch (e.g. `git diff <merge-base> HEAD` or `--name-only` + `--patch`), or reuse `git --no-pager diff`.
- Only a **read-only** renderer is needed — no editing, staging, applying, or reverting in this task.
- Keep the existing `GET /api/tasks/:id/diff-stats` endpoint and the Task tab stats panel untouched.
- The diff can be large; cap the response size and surface a truncation notice rather than shipping unbounded payloads.
- Avoid shell interpolation when invoking git — pass arguments via the existing `git()` helper (array form) in `src/core/git.ts`.
- UI lives in `src/ui-app/src/components/TaskDrawer.vue` (tab bar around line 1817, per-tab body switches below). After any UI change, rebuild with `bun run build:ui` (or `bun run build`) and verify before reporting done.
- Zero runtime dependencies is a hard constraint. Do not add a runtime dependency without an explicit task authorizing it.

## Activity

- 2026-08-14T12:06:16Z · created · unknown
- 2026-08-14T12:14:04Z · status inbox→ready
- 2026-08-15T02:41:38Z · body
