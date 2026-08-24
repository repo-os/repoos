---
id: "0271"
title: MTD hit a merge conflict despite a clean main before the click
type: bug
status: ready
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-24T15:56:02Z"
updated_at: "2026-08-24T17:37:37Z"
---
## Problem
Main was clean (verified before clicking Move to done), but the merge still hit a conflict on click.

Concretely: the close-out **merge/validation step** reported a source conflict even though the user had
just confirmed main was clean. A clean main must never produce a merge conflict on Move to done — if it
does, one of two things went wrong and each is a bug:
1. the conflict is in a path the close-out is *supposed* to auto-resolve (the task's own file, `dist/`,
   `screenshots/`, or any other `work/` task file), but auto-resolution silently failed; or
2. the tree the merge saw was **not** the tree the user verified — a real second-order change landed in
   the window between the user's clean check and the merge (dirty `dist`, a concurrent task edit, or a
   stale candidate).

## Root-cause analysis (PM pass, 2026-08-24)
The live review→done path is `CloseOutOrchestrator` in `src/server/integration-orchestrator.ts`
(`done.ts`'s `completeTask` is the legacy path, still exercised only by tests). The merge itself happens
in `validateCandidate` at `integration-orchestrator.ts:464`:

    mergeBranch(wtPath, featureBranch, { autoResolve, autoResolveOurs })
      autoResolve   = ["dist/", "screenshots/", work/<task-file>.md]
      autoResolveOurs = ["work/"]

The candidate worktree is `git reset --hard main`-ed during `syncCandidate`, so the only way the merge
conflicts is if the **feature branch and main disagree** on a path not covered by auto-resolve, OR if the
auto-resolve itself fails to complete.

Two concrete failure modes fit the report:
- **Task-file auto-resolution gap.** The closing task's file is auto-resolved `--theirs` (branch wins),
  and every other `work/` file is `--ours` (main wins). But `mergeBranch` (git.ts:832) only completes the
  auto-resolve when `conflicts.every(p => autoResolvable(p) || keepOurs(p))`. If even **one** conflicted
  path is outside `work/`, `dist/`, `screenshots/`, and the task file, the whole merge aborts — so a
  *single* ordinary source file touching both sides turns the task-file bookkeeping staleness into a hard
  "merge conflict" card that routes to the debugger.
- **Staleness-in-the-check (shared root cause with #0276).** `validateCandidate` runs `bun run build`
  (line 500) and then `repoos check` with `REPOOS_SKIP_BUILD=1` (lines 518-528). `check.ts`'s staleness
  check runs *before* its build step, so if the build marker (`dist/.build-info.json`) lags the source by
  one cycle the first check reports "build is stale" and fails the gate — which, because the close-out
  retries the whole pipeline (owner-restart), can ride along as the "conflict" the user sees. See #0276 for
  auto-handling that pattern.

## Fix
Investigate and fix the root cause so a clean main never conflicts on merge. Expected scope:
1. **Reproduce** the conflict deterministically (see Reproduction below).
2. **Tighten auto-resolve** so the closing task's bookkeeping can never resurface as a hard conflict, and
   log when a non-auto-resolvable path legitimately blocks so the debugger gets the real culprit, not the
   task file.
3. **Confirm the candidate/merge sees a truly clean, up-to-date main** at merge time — no second-order
   window between validation and publish.
4. **Do not rely on the debugger detour** for a known self-resolving staleness pattern — that is #0276.

## Reproduction
1. Create a branch-mode task, land a real source change on both the branch AND independent main changes
   (a CTO/DM nudge or another task's `work/` edit) so main and the branch diverge.
2. Leave the task's own file with review-activity bookkeeping newer on main than on the branch.
3. Move to done, verify main is clean right before the click.
4. Observe the merge/validation step report a conflict (and whether it is pinned on the task file or a
   real source file). A clean main + only-task-file divergence should never reach the debugger.

## Acceptance criteria
- [ ] Move to done on a task whose only divergence from a clean main is its own/task-file bookkeeping
      completes (fast-forward or auto-resolved merge), never a "merge conflict" card.
- [ ] A genuine competing source change on main still fails loudly, pinning the **real** conflicting path
      (not the task file).
- [ ] No regression in the #0130 already-integrated retry, #0204 dirty/lock guards, or #0211 dirty-main
      fail-closed checks.
- [ ] `repoos check` passes after the fix.

## Notes
- Related: #0276 (auto-handle the self-resolving staleness in MTD instead of routing through the
  debugger) — likely the same root cause; coordinate so the two changes don't conflict.
- Self-hosted guard: this is a server behavior change; verify against the live close-out pipeline
  (`CloseOutOrchestrator`), not the legacy `completeTask`, which is test-only.

## Activity

- 2026-08-24T15:59:01Z · body
- 2026-08-24T17:33:27Z · PM: fleshed out with root-cause analysis, reproduction, and acceptance criteria; linked to #0276.
- 2026-08-24T17:34:18Z · body
- 2026-08-24T17:37:37Z · status inbox→ready
