---
task: "1070"
pass: 13
at: "2026-11-10T01:10:38.403Z"
agent: reviewer
cli: codex
model: gpt-6.1-terra
branch: feat/first-load-skeletons-match-every-page-s-
state: ok
tree_identity: "994d7aa4a:eb810be18"
---
Repeated review classes: Placeholder counts, motion binding, and the missing shell cross-fade were addressed. Shell transition geometry still fails at mobile widths. A human should look at the recurring transition and test-coverage pattern.

## Relevance

still relevant — Main still has the mismatched first-load skeletons.

## Evidence

None

## Bugs

- **Transition geometry:** [style.css](/Users/nick/code/nick/repoos-worktrees/feat/first-load-skeletons-match-every-page-s-/src/ui-app/src/style.css:1454) positions the fading shell using desktop insets of 22px and 26px. The mobile `.main` rule at line 9468 changes its padding to 18px and 16px without updating those variables. At mobile widths, the outgoing shell jumps down and inward and narrows as the route fades in. The CSS test checks desktop values only. Per-view exit timing remains assigned to #1078.

## Edge cases

The engineering report describes commit `eb810be18`, not reviewed HEAD `994d7aa4a`; its claim that the cross-fade was removed is stale. A current-round report is missing.

The recorded Mission Control capture is readable and shows no broken state, though a toast overlaps the title. It is stale for HEAD; its route matched and the recorded console had zero errors. Loading-state captures were explicitly waived.

The server reports only this task’s bookkeeping file conflicts with main.

## Suggestions

Re-capture the settled Mission Control page on HEAD; a settled Stories capture would also help comparison. Address per-view timing, board breakpoints, motion settings and cache seeding in #1078.

## Verdict

needs some work — The shell cross-fade shifts the loading layout at mobile widths.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-09T22:31:01.160Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

