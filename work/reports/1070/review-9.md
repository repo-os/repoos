---
task: "1070"
pass: 9
at: "2026-11-09T17:09:20.595Z"
agent: reviewer
cli: codex
model: gpt-6.1-terra
branch: feat/first-load-skeletons-match-every-page-s-
state: ok
tree_identity: "b612d39d7:b612d39d7"
---
Repeated review classes: The count regression, delayed motion binding, and leaked test stub are fixed. Per-view timing and cache seeding remain assigned to #1078. The shell transition and source-text test patterns remain; a human should look at the recurring pattern.

## Relevance

still relevant — Main still has the mismatched first-load layouts this branch addresses.

## Evidence

None. The current handoff capture shows a settled Mission Control page; it is not blank or broken, though a toast overlaps the title. The recorded route matched and the console log has zero errors. Loading-state shots were explicitly waived.

## Bugs

- **Transition lifecycle:** [App.vue](/Users/nick/code/nick/repoos-worktrees/feat/first-load-skeletons-match-every-page-s-/src/ui-app/src/App.vue:166) removes the entire loading wrapper when `showRepoSkeleton` becomes false. That unmounts [PageSkeleton.vue](/Users/nick/code/nick/repoos-worktrees/feat/first-load-skeletons-match-every-page-s-/src/ui-app/src/components/PageSkeleton.vue:124) before its leave transition can finish, while `RouterView` appears without an enter transition. The shell therefore pops to content instead of cross-fading as required. The accepted exit-timing exception applies to per-view skeletons; this is the shell path.

## Edge cases

The engineering report’s source commit matches the implementation tree; subsequent commits are bookkeeping. The server reports only the task’s own bookkeeping file conflicts with main, which close-out resolves.

## Suggestions

- Address per-view delay, exit timing and cache seeding in #1078 as agreed.
- Replace CSS source-text assertions with rendered behavior checks where practical. Consider measuring the representative block heights against the settled pages.

## Verdict

needs some work — The shell removes its skeleton before the required content cross-fade can run.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-09T16:38:05.469Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

