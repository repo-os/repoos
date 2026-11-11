---
task: "1070"
pass: 10
at: "2026-11-09T19:07:51.471Z"
agent: reviewer
cli: codex
model: gpt-6.1-terra
branch: feat/first-load-skeletons-match-every-page-s-
state: ok
tree_identity: "15560c822:15560c822c"
---
Repeated review classes: Placeholder counts, conditional motion binding, and the leaked test stub are fixed. The shell transition now retains its outgoing element, but its layout still shifts during the fade. Per-view timing and cache seeding remain assigned to #1078. A human should look at this recurring transition and test-coverage pattern.

## Relevance

still relevant — Main still has the mismatched Mission Control and Stories skeletons.

## Evidence

None.

## Bugs

- **Transition layout:** [App.vue](/Users/nick/code/nick/repoos-worktrees/feat/first-load-skeletons-match-every-page-s-/src/ui-app/src/App.vue:166) renders the leaving shell and incoming route simultaneously. Both remain in the column-flex `.main` flow and receive `flex: 1 1 auto` from [style.css](/Users/nick/code/nick/repoos-worktrees/feat/first-load-skeletons-match-every-page-s-/src/ui-app/src/style.css:1389), so they divide the available height during the 140 ms fade; the route then expands when the shell is removed. This causes the layout shift the cross-fade is meant to prevent. The new test checks coexistence but does not check their geometry. The per-view leave path already takes its skeleton out of flow and is covered by the accepted #1078 scope.

## Edge cases

The engineering report’s source commit matches the reviewed implementation; the later commit is bookkeeping. The server reports only the task’s own bookkeeping file conflicts with main.

The current auto capture shows a settled Mission Control page, with a toast overlapping its title; it is neither blank nor broken. The route matched and the recorded console had zero errors. Loading-state captures were explicitly waived.

## Suggestions

Address per-view delay, exit timing, responsive board behavior, motion settings and cache seeding in #1078 as agreed. Consider a settled Stories capture for human comparison.

## Verdict

needs some work — The shell cross-fade temporarily compresses the incoming page and causes a layout shift.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-09T19:06:35.528Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

