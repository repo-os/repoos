---
task: "1070"
pass: 16
at: "2026-11-10T07:45:51.047Z"
agent: reviewer
cli: codex
model: gpt-6.1-terra
branch: feat/first-load-skeletons-match-every-page-s-
state: ok
tree_identity: "829b5d627:829b5d627"
---
Repeated review classes: Placeholder counts, motion binding and the flex-flow compression are fixed; shell transition lifecycle has regressed to the pass 14 finding. A human should look at the recurring transition and test-coverage pattern.

## Relevance

still relevant — Main still uses the mismatched dashboard skeleton.

## Evidence

None

## Bugs

- **Transition lifecycle:** [App.vue](/Users/nick/code/nick/repoos-worktrees/feat/first-load-skeletons-match-every-page-s-/src/ui-app/src/App.vue:166) uses `mode="out-in"`, so the loading shell disappears before the route fades in. The required cross-fade does not occur, and the static header fades away even on fast loads. This affects every shell route. Per-view exit timing is separately deferred to #1078.

## Edge cases

The engineering report’s source commit matches the implementation; only report bookkeeping changed afterward. The server reports that the sole merge conflict is the task’s bookkeeping file.

The settled Mission Control capture is readable and route-matched, though a toast covers part of the title. The recorded console has no errors. Loading-state captures were explicitly waived.

## Suggestions

Address per-view timing, board breakpoints, motion settings and cache seeding in #1078. A settled Stories capture would help the human compare layouts.

## Verdict

needs some work — The shell transition removes the header and does not cross-fade into content.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-10T07:44:28.374Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

