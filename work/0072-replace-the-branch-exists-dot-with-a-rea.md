---
id: "0072"
title: "Replace the \"branch exists\" dot with a real status hint on task cards"
type: feature
status: review
priority: p2
area: ui
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-11T03:27:18Z"
updated_at: "2026-08-11T03:51:14Z"
---
## Problem

Every task card's footer has two sides: the right side holds the action
button, the left side currently shows a bare green dot (`●`, title "branch
exists locally") whenever `task.git.branchExists` is true
(`src/ui-app/src/components/TaskCard.vue:139`). This tells the user almost
nothing — branches exist locally for the overwhelming majority of tasks past
`inbox`, so the dot is on most cards, unlabeled, and doesn't help anyone
decide what to do next. Meanwhile the card has no dedicated place to surface
the things that actually matter: that an agent looks stuck, that something
errored, or that the task needs a human. The left side of the footer is
prime, always-visible real estate that's currently wasted on noise instead of
signal.

## Desired UX

- The green "branch exists locally" dot is gone. It never renders on a task
  card again.
- The left side of the card footer (mirroring the action button on the
  right) becomes a status/hint slot: a short, legible text label (not a bare
  color or icon) that tells the user something worth knowing about *this*
  card right now.
- The hint reflects the most useful thing known about the task's current
  state, using signals already available on `Task`:
  - Agent actively running → keep today's "running" hint (already present,
    just now understood as one case of the general hint slot rather than a
    one-off).
  - `needsInput` true → a clear "needs you" style hint (the task is waiting
    on a human decision).
  - `active`, but no agent process running and `needsInput` is false → a
    hint that flags this as an ambiguous/stalled state (e.g. "stopped —
    check the agent") instead of silently looking identical to an active,
    healthy run. This is the "stuck" case called out by the user: today
    there is no way to tell a crashed/stopped agent from one making
    progress.
  - Nothing useful to report (e.g. `draft`, `inbox`, `ready`, `done`) → the
    slot stays empty; don't invent a hint where there isn't one.
- The hint is a small text label, styled distinctly from the action button
  but readable at a glance — not just a colored dot.

## Acceptance criteria

- [ ] The `tc-git` span and its `branch exists locally` dot are removed from
      `TaskCard.vue`; no card renders a bare dot for branch existence.
- [ ] The card footer's left side is a single status/hint slot that shows
      (priority order when more than one could apply): running > needs
      input > stalled (`active`, not running, not needing input) > nothing.
- [ ] Each hint is a short text label with a clear meaning on hover/inspection
      (e.g. via `title`), not an unlabeled glyph.
- [ ] `draft`, `inbox`, `ready`, and `done` tasks show no hint by default
      (no false signal invented for states with nothing to report).
- [ ] `task.git.branchExists` and the underlying git-status field are left
      untouched everywhere else (e.g. `TaskDrawer.vue`'s git details) — only
      the card-level dot is removed.
- [ ] `repoos check` passes.

## Notes for AI

- Scope this to `src/ui-app/src/components/TaskCard.vue`'s `tc-foot` block
  (~lines 138-145) and its styles. The existing `tc-run` "running" hint
  (line 140) is the template for the new unified hint slot — extend/replace
  it rather than adding a second parallel element.
- `needsInput` already drives a pulsing badge at the top of the card
  (`tc-waiting`, line 125, from #0067) — the new footer hint is
  complementary, not a replacement for that badge. Don't remove the existing
  badge.
- There is no existing signal for "agent crashed" or a time-based staleness
  check — don't build one. The "stalled" case in this task is a simple,
  already-available boolean condition (`active` status, not running, not
  `needsInput`), not a new detector. Timer-based/heuristic "stuck" detection
  is explicitly out of scope (already deferred by #0067 for the same
  reason).
- `task.git.branchExists` is still read elsewhere (`TaskDrawer.vue:953`,
  `src/server/live-index.ts`, `src/core/indexer.ts`, `src/core/git.ts`) —
  do not remove the field or its plumbing, only its card-level rendering.
- After the change, rebuild (`bun run build:ui`), keep `repoos serve`
  running, and verify with a browser probe: confirm the dot is gone, and
  that a running task, a `needsInput` task, and a plain `active`/stalled
  task each show the expected hint text.

## Scope

- Covers: removing the branch-exists dot; adding a text-based status/hint
  slot to the card footer driven by existing `running`/`needsInput`/`active`
  signals.
- Deferred: time-based or heuristic "stuck" detection; a dedicated "needs
  merge" hint (tracked separately in #0069, not yet built); richer
  multi-line hints or per-status custom copy beyond the cases listed above.

## Related

- 0055 · decluttered task cards and introduced the action button on the
  right side of the footer
- 0067 · `needsInput` flag and the top-of-card "needs input" badge
- 0069 · proposed `needs_merge` flag/chip for review tasks (a future input
  to this same hint slot)

## Activity

- 2026-08-11T03:27:18Z · created · unknown
- 2026-08-11T03:51:14Z · status inbox→ready
- 2026-08-12T00:00:00Z · status ready→review
