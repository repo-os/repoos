---
id: "0276"
title: Auto-handle the self-resolving staleness check in MTD instead of routing through the debugger
type: bug
status: ready
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-24T15:57:24Z"
updated_at: "2026-08-24T19:46:06Z"
---
## Problem

A known, self-resolving "build is stale" failure in the Move-to-Done (MTD) flow keeps getting
routed through the full debugger → engineer repair detour, which is wasted time and cost every
time. The engineer's own repair-run notes described it as "the same self-resolving staleness
pattern seen before (the check runs against the pre-build tree, then the build within this same
invocation refreshes it)."

If the pattern is genuinely self-resolving — the same invocation's build refreshes the marker and
a second check passes with identical source — then it must be absorbed automatically by MTD, not
surfaced as a job failure that strands the task in review and hands it to the debugger.

## Root-cause analysis (PM pass, 2026-08-25)

The MTD gate is `validateCandidate` in `src/server/integration-orchestrator.ts`. Its current order:

1. **Build first** (`integration-orchestrator.ts:500`): `bun run build` in the candidate worktree,
   which regenerates `dist/.build-info.json` (the `{ hash, version }` marker).
2. **Check second** (`integration-orchestrator.ts:518-528`): runs the candidate's OWN freshly-built
   `dist/cli/index.js check` with `REPOOS_SKIP_BUILD=1`, so `check`'s internal "Full build" step
   is skipped (#0213).

`repoos check` runs its **build-staleness check first** (`src/commands/check.ts:343-359`) — before
its own "Full build" step — comparing the current `src/` hash against the marker
(`checkBuildForRoot` in `src/core/build.ts`).

So the order inside MTD is already build-then-check, which *should* keep the marker fresh at check
time. When it still reports "stale," that is only possible if the tree the check sees differs from
the tree that was just built, OR the check's own in-invocation build got skipped. Concretely there
are two flavours, and the fix must tell them apart:

**Flavour B — the genuinely self-resolving one (what this task targets).** When `check` runs with
`REPOOS_SKIP_BUILD=1` (the MTD case), the "Full build" step only skips when the step-1 staleness
check reported the build **fresh** (`skipBuildAction` → "skip"; `check.ts:331-337, 398-409`). If the
marker is stale at step 1, `buildFresh` is false, `check` falls through to `build-not-fresh` and
*does* rebuild — so a stray stale marker self-heals inside that same invocation, and the check
passes on retry without any source change. When `check` is run standalone (no `REPOOS_SKIP_BUILD`),
the same step-1 failure trips `exitCode = 1` but the build step still runs and refreshes the marker,
so a second standalone `check` passes. Either way, **once the marker is refreshed for the current
source, the identical check re-run goes green.** This is the self-resolving pattern the engineer
described, and today it is surfaced as a `check failed: ...stale...` job failure that MTD retries
only as a full second `validateCandidate` (build+check+resync) and then hands to the debugger.

**Flavour A — a real, non-self-resolving bug to rule out first (may share a root cause with
#0271).** Because MTD already builds before check, a "stale" report here can also mean the check
gate evaluated a DIFFERENT tree than the one that was just built:
- The candidate's own `dist/cli/index.js` is missing, so `validateCandidate` falls back
  (`integration-orchestrator.ts:524`) to a globally-linked `repoos` or `bun run repoos check`. A
  linked dev CLI's `checkBuildForRoot(findRepoRoot())` compares the **candidate's** `src/` hash
  (`findRepoRoot()` resolves from `process.cwd()`, which is the candidate) against the **linked
  install's** own `dist/.build-info.json` — a guaranteed hash mismatch that reports "stale" no
  matter how fresh the candidate's build is. The #0213 doc
  (`docs/close-out-pipeline.md:167-189`) warns this exact CLI-selection regression was fixed once;
  it can regress again, and it is NOT self-resolving.
- A genuine second-order source change landed in the candidate between the build (line 500) and the
  check (line 520) — e.g. the concurrent auto-reload churn or a stray edit. This is the same
  "different tree than the user verified" family as the #0271 merge-conflict report.

The fix must make Flavour B cheap and automatic without masking Flavour A: the first check result
must be classified by *why* it failed, and only the proven-self-resolving staleness case gets an
in-place re-check of the same tree (no full re-resync, no debugger detour). See #0271 for the
merge-conflict sibling; the two likely share the "gate evaluated a tree that differs from the one
freshly built" root cause, so coordinate the investigation.

## Fix (proposed)

In the MTD validating phase, absorb the self-resolving staleness check instead of treating it as a
gate failure that routes to the debugger:

1. **Classify, don't blanket-retry.** When `validateCandidate`'s check step fails with a staleness
   failure ("Stale build:" / "No build found" / "no .build-info.json" in `check.ts`), do not return
   a retryable `validateCandidate` failure (which triggers a full re-sync + re-build + re-merge) and
   do not hand it to the debugger. Instead:
   - If the candidate's own `dist/cli/index.js` is the CLI that ran (Flavour A's precondition is
     absent), re-run the SAME check once in-place against the same candidate tree (after ensuring
     the marker is refreshed for current source — `bun run build` if it isn't). This mirrors the
     standalone self-resolving behaviour inside the MTD invocation.
   - If the candidate's own CLI was NOT what ran (fallback path taken — the global `repoos` /
     `bun run repoos` branch), that is Flavour A: a real CLI-selection regression, not
     self-resolving. Surface THAT loudly (pin the reason to "candidate's own dist/cli/index.js was
     not used"), matching the #0213/`3fbbd707` guidance, rather than silently absorbing it.
2. **Keep the retry capped.** In-place staleness re-check is a second `check` of the same tree,
   bounded to one extra attempt; it must not loop. It sits *inside* `validateCandidate`'s check
   step, not as an extra orchestrator-level `validateCandidate` call, so the existing two-attempt
   cap and the "reproduced identically → real failure" classification in
   `integration-orchestrator.ts:247-275` still do their job for genuine defects.
3. **Order: confirm the build is fresh before re-check.** If the in-place re-check is approached
   with `REPOOS_SKIP_BUILD=1`, run `bun run build` first (idempotent on the candidate) so the
   marker provably matches `src/`, then re-run `check` with the skip flag. This guarantees the
   re-check sees a fresh marker and only fails again on a real regression.
4. **Never send the self-resolving case to the debugger.** Route only genuine, reproduced-second-time
   failures to the debugger path.
5. **Coordinate with #0271.** Confirm whether the "pre-build tree the check saw vs. the freshly
   built tree" gap is the same root cause as the merge-conflict-in-spite-of-clean-main report; if
   so, land the shared understanding/fix in the same area and cross-link both tasks.

Constraint: this is an MTD-flow behaviour change only. Do not weaken standalone `repoos check` (the
agents' definition-of-done gate) — it must keep failing on a genuinely stale build. The auto-handle
lives in the orchestrator's invocation, not in `cmdCheck`'s semantics.

## Reproduction

1. Standalone: from a checkout with a stale marker (`dist/.build-info.json` hash != `src/` hash),
   run `repoos check`. Confirm it reports "stale" at the build-staleness step but the "Full build"
   step then refreshes the marker, so a SECOND `check` is green. This is the self-resolving pattern
   to absorb.
2. MTD: force the same pre-build-marker condition into a candidate worktree just before
   `validateCandidate`'s check step (or stub `checkBuildForRoot` to return stale once), start a
   Move-to-Done, and observe whether the current code fails the job / routes to the debugger. After
   the fix, it must pass on the in-place re-check without a debugger detour and without a full
   re-sync.
3. Flavour A check: remove (or rename) the candidate's `dist/cli/index.js` and re-run the gate.
   Confirm the current fallback path reports "stale" — this must NOT be silently absorbed by the
   fix; it should surface the CLI-selection regression loudly instead.

## Acceptance criteria

- [ ] A Move-to-Done whose only failure is the self-resolving staleness check completes on the
      in-place re-check — no job failure, no debugger detour, no full re-sync, and no extra
      orchestrator-level `validateCandidate` retry.
- [ ] The in-place staleness re-check is bounded to a single extra `check` of the same candidate
      tree and never loops; the existing two-attempt cap and "reproduced identically → real
      failure" classification are unchanged for genuine defects.
- [ ] When the candidate's own `dist/cli/index.js` is missing and the fallback CLI is used, the
      staleness failure is NOT absorbed: it surfaces with a reason pinning the CLI-selection
      regression (per docs/close-out-pipeline.md #0213/3fbbd707) instead of the debugger seeing a
      red herring.
- [ ] Standalone `repoos check` still fails on a genuinely stale build (agents' definition-of-done
      gate unchanged).
- [ ] No regression in the #0130 already-integrated retry, #0204/#0211 dirty/lock guards, or the
      MTD merge-conflict handling tracked in #0271.
- [ ] `repoos check` passes after the fix.

## Related

- #0271 — MTD merge conflict despite a clean main; likely shares the "gate evaluated a tree that
  differs from the one freshly built" root cause. Same area (server, MTD validating phase).
- #0213 — skip redundant `check` build step; establishes `REPOOS_SKIP_BUILD` and the local-CLI-first
  selection this task builds on.
- #0216 — oracle gate retry; the two-attempt validation classification this task preserves.

## Activity

- 2026-08-24T16:00:03Z · body
- 2026-08-24T17:41:22Z · body
- 2026-08-24T19:46:06Z · status inbox→ready
