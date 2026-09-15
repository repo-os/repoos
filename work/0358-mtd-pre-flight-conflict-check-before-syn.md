---
id: "0358"
title: "MTD: pre-flight conflict check before syncing a candidate worktree, not after"
type: feature
status: ready
priority: p2
area: server
assigned_to: ai
created_by: ""
branch: ""
model_override: openrouter/deepseek/deepseek-v4.1-flash
created_at: "2026-09-15T16:00:08Z"
updated_at: "2026-09-15T18:25:19Z"
---
## Problem

`processJob`'s validating phase always creates/syncs a full candidate worktree
(`syncCandidate` → `ensureWorktree`, `src/server/integration-orchestrator.ts:631-670`)
BEFORE `validateCandidate` attempts the actual `mergeBranch` merge
(`integration-orchestrator.ts:707`) and discovers a real conflict. When main
has genuinely diverged from a task's feature branch in a non-auto-resolvable
way, this is fully predictable in advance from cheap git plumbing — but today
the task still pays for a candidate worktree creation (git worktree add,
node_modules symlink) and a full merge attempt before landing on the exact
same outcome: `retryable: false`, handed straight to the #0271 auto-repair
engineer in the FEATURE branch's own worktree
(`onMergeConflict`, `processJob` around line 496-501).

This surfaced from watching #0350 live (2026-09-15): its branch had fallen
behind main (#0348/#0349 touched the same file, `src/commands/check.ts`), and
running MTD on it would have gone through this exact wasted cycle before
self-healing. The self-heal already works correctly — this task is about
skipping the guaranteed-to-fail attempt that precedes it, which today reads
as a visible "job failed" before the automatic recovery, and is unnecessary
friction for a human watching the board.

## Non-goals — read before touching this

- **Do not change what counts as a real conflict.** `mergeBranch`
  (`src/core/git.ts:1244`) already has the one true definition: a merge that
  survives its own `autoResolve`/`autoResolveOurs` strategies (dist/,
  screenshots/, the task's own work file get auto-resolved; other work/*.md
  files take main's side) and still has unresolved paths. The pre-flight
  check MUST reuse this exact logic, not a hand-rolled parse of `git
  merge-tree` output — a second, drifting implementation of "is this a real
  conflict" is exactly the kind of bug this codebase has been bitten by
  before (see #0271's own history). Prefer adding a dry-run mode to
  `mergeBranch` itself (e.g. an option that merges in a scratch/detached
  context and never touches the working worktree's state) over duplicating
  its conflict classification elsewhere.
- **Do not touch the build/check gate, the self-resolving-staleness handling
  (#0276), or the two-attempt retry/classification logic in `processJob`
  (#0216).** This task is scoped to ONE thing: skip candidate-worktree
  creation when a pre-flight check already knows the merge will hit a real
  conflict. Every other failure mode (build failure, check failure, transient
  infra) keeps going through the existing candidate-worktree flow unchanged.
- **Do not change the outcome for the non-conflict path.** A branch that
  merges cleanly (or only touches auto-resolvable paths) must go through the
  exact same `syncCandidate` → `validateCandidate` flow as today, with
  identical behavior. This is purely an optimization to skip wasted work for
  the conflict case, not a new code path for anything else.
- **Do not weaken the non-retryable classification.** A real conflict is
  still `retryable: false` and still hands off to the same `onMergeConflict`
  repair path — only the TIMING moves earlier (before candidate-worktree
  creation), not the outcome or the recovery mechanism.

## Direction

Run the pre-flight check where a job transitions out of `queued`, or as the
very first thing `syncCandidate` does — before `ensureWorktree` is called.
Use the feature branch's own worktree (`worktreePathForBranch(root, job.branch
?? job.taskId)`, already checked out and cheap to use) and the CURRENT main
SHA (same `resolveDefaultBranch` + `rev-parse` pattern already used in both
`syncCandidate` and `validateCandidate` — don't use a stale SHA). If the
pre-flight merge would produce a real (non-auto-resolvable) conflict, skip
candidate-worktree creation entirely and route straight to the same
`onMergeConflict` handoff `processJob` already uses for a conflict discovered
during `validateCandidate` — same reason string format, same non-retryable
classification, so nothing downstream (the UI, the activity log, the repair
engineer) needs to know whether the conflict was caught early or late.

If the pre-flight check itself fails for an unrelated reason (git error,
worktree missing, timeout), fail open — fall through to the existing
sync/validate flow unchanged rather than blocking the job on a broken
optimization.

## Acceptance criteria

- [ ] A task whose branch has a real, non-auto-resolvable conflict against
      current main is routed to the `onMergeConflict` repair engineer WITHOUT
      a candidate worktree ever being created for that job attempt.
- [ ] A task whose branch merges cleanly, or only touches auto-resolvable
      paths (dist/, screenshots/, its own work file, other tasks' work
      files), proceeds through the full existing `syncCandidate` →
      `validateCandidate` flow with no behavior change.
- [ ] The conflict-classification logic lives in exactly one place (reused
      by both the pre-flight check and the real merge), not duplicated.
- [ ] A pre-flight check failure (git error, missing worktree, timeout) falls
      back to the existing flow rather than blocking the job.
- [ ] No regression in #0276 (self-resolving staleness absorption), #0216
      (two-attempt validate retry/classification), or #0271 (merge-conflict
      auto-repair itself) — these are all orthogonal to this task and their
      existing tests must keep passing unchanged.
- [ ] Tests cover: real-conflict pre-flight (no worktree created, repair
      triggered), auto-resolvable-only pre-flight (normal flow proceeds),
      clean branch (normal flow proceeds), and pre-flight-check-itself-fails
      (falls back to existing flow).
- [ ] `repoos check` passes.

## Related

- #0271 — established the merge-conflict auto-repair path this task makes
  proactive rather than reactive; do not change its actual repair mechanism.
- #0276 — the self-resolving staleness absorption in the SAME validating
  phase; explicitly out of scope, called out above to prevent scope creep.
- #0350 — the real task run that surfaced this friction; see its activity
  log for the actual timeline (branch fell behind main across #0348/#0349,
  resolved manually rather than through the automated path this task adds).

## Activity

- 2026-09-15T16:00:08Z · created · unknown
- 2026-09-15T18:25:10Z · status inbox→ready
- 2026-09-15T18:25:19Z · model_override
