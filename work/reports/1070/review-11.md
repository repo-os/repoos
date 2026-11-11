---
task: "1070"
pass: 11
at: "2026-11-09T20:02:43.865Z"
agent: reviewer
cli: codex
model: gpt-6.1-terra
branch: feat/first-load-skeletons-match-every-page-s-
state: ok
tree_identity: "de463d4db:de463d4db3"
---
Repeated review classes: Placeholder counts, conditional motion binding and the leaked test stub are fixed. Shell transition lifecycle is fixed, but its positioning still causes a visual shift. Per-view timing and cache seeding remain assigned to #1078. A human should look at the recurring transition and test-coverage pattern.

## Relevance

still relevant — Main still has the mismatched Mission Control and Stories skeletons.

## Evidence

None

## Bugs

- **Transition geometry:** In [style.css](/Users/nick/code/nick/repoos-worktrees/feat/first-load-skeletons-match-every-page-s-/src/ui-app/src/style.css:1447), the leaving shell becomes absolute with `inset: 0` and `width: 100%`. Its normal position is inside `.main`’s 22px top and 26px horizontal padding, so it jumps up and left and widens as the fade begins. The incoming route remains padded. The CSS assertions check that the shell leaves the flex flow but miss this position change.

## Edge cases

The engineering report’s source commit matches the implementation; the later commit contains bookkeeping only. The server reports a conflict only in this task’s bookkeeping file, which close-out resolves.

The settled Mission Control capture is neither blank nor broken. A toast overlaps the title; the route matched and the recorded console had zero errors. Loading-state captures were explicitly waived.

## Suggestions

Address per-view delay, exit timing, responsive board behavior, motion settings and cache seeding in #1078 as agreed. A settled Stories capture would help human comparison.

## Verdict

needs some work — The outgoing shell shifts position and width when its fade begins.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-09T20:01:49.428Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

