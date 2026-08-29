---
id: "0318"
title: Add per-task sync-with-main button to debug tab
type: feature
status: ready
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: ""
model_override: opencode-go/hy3
created_at: "2026-08-28T16:17:21Z"
updated_at: "2026-08-29T04:35:59Z"
---
## Problem

RepoOS currently has a limited, automatic way to refresh a task's git worktree
against `main`: when a task's change set looks much bigger than the task itself
(see the existing "This diff looks much bigger than the task — main has likely
drifted since the branch was cut." flow), the system actively re-syncs against
main. But that behavior only kicks in when the divergence is large.

There is no way to trigger a sync with `main` on an individual task on demand.
Owners of tasks whose branches have drifted from `main` — because of recent
fixes or updates landed on `main` that the worktree needs to pick up — have no
manual control to reconcile their worktree. This is a gap: the capability
exists but is only surfaced automatically in the large-divergence case, not made
available for every task.

## Desired UX

On the new debug tab, each task that is associated with a git worktree (a branch
cut from `main`) exposes a button to trigger a sync with `main`. Clicking it
re-runs the same main-sync/reconcile logic currently used in the large-
divergence case, but available for every task rather than only when divergence
is detected automatically.

The action should be clearly associated with the individual task it acts on, and
be visible/usable regardless of how much the task's worktree has diverged from
`main`. The existing automatic large-divergence behavior should continue to work
as today.

## Acceptance criteria

- [ ] A "sync with main" trigger is added to the new debug tab.
- [ ] The trigger is tied to a specific individual task (not applied globally).
- [ ] The trigger is available for all tasks with a worktree/branch, not only
      the large-divergence case.
- [ ] Triggering it invokes the existing main-sync/reconcile logic (the same
      mechanism behind the large-divergence flow).
- [ ] The existing automatic large-divergence detection and reconcile continues
      to function as before.
- [ ] Success/failure of the sync is surfaced in the UI.

## Notes for AI

- The feature lives on the new debug tab (the same tab mentioned in the request);
  do not add the button to other existing surfaces unless it is trivial.
- Reuse the existing main-sync/reconcile logic rather than writing a new
  implementation; the large-divergence flow already demonstrates the mechanism.
- This is a UI change — after any change, rebuild (`bun run build:ui` for speed,
  or `bun run build`) so the worktree build is fresh.
- Assumption: "all tasks" means tasks that have an existing git worktree/branch
  cut from `main`; tasks without such a worktree (e.g. still in `inbox`) don't
  need a sync action and may hide the button. If a task has no worktree, the
  button should not appear (or should be disabled with a tooltip), and the
  chosen behavior should be stated here.
- Do not change the automatic large-divergence behavior itself; that path should
  remain untouched.
- Keep frontmatter tidy; `repoos` normalizes key order on write. Follow RepoOS
  rules: never write directly to `work/*.md`, and never commit `dist/`.

## Scope

- Adds the on-demand per-task "sync with main" control to the debug tab and
  wires it to the existing reconcile logic.
- Defers any change to the automatic large-divergence detection thresholds or
  behavior — out of scope.

## Related

- The large-divergence auto-sync flow ("This diff looks much bigger than the
  task — main has likely drifted since the branch was cut.") that this reuses.
- The new debug tab where the control lands.

## Original prompt

I think we need a way to trigger a sync with main on individual tasks that have diverged from main too much or there's a key update/fix on main that existing task git worktrees will need. currently we already have this functionality when the changes are a lot ("This diff looks much bigger than the task — main has likely drifted since the branch was cut."), but we actually need it on all tasks, let's put a button on the new debug tab

## Activity

- 2026-08-28T16:17:51Z · status draft→inbox, title, area, body
- 2026-08-29T04:35:49Z · model_override
- 2026-08-29T04:35:59Z · status inbox→ready
