---
task: "1070"
pass: 19
at: "2026-11-10T08:10:39.598Z"
agent: reviewer
cli: codex
model: gpt-6.1-terra
branch: feat/first-load-skeletons-match-every-page-s-
state: ok
tree_identity: "829b5d627:829b5d627"
---
Repeated review classes: placeholder counts, motion registration and transition geometry were fixed or narrowed by the owner’s accepted scope. Shell transition lifecycle remains unresolved; a human should look at this recurring pattern.

## Relevance

still relevant — Main still uses the six-card dashboard skeleton that prompted the task.

## Evidence

None

## Bugs

- **Transition lifecycle:** [App.vue](/Users/nick/code/nick/repoos-worktrees/feat/first-load-skeletons-match-every-page-s-/src/ui-app/src/App.vue:166) uses an `out-in` transition for every shell route. The loading shell and its static header fade out before the page fades in, including on fast loads where no skeleton appeared. This fails the requested cross-fade and continuous static chrome. The accepted per-view exit-timing exception does not cover the shell.

## Edge cases

The engineering report’s source commit matches the reviewed implementation; later commits contain bookkeeping only. The server reports a conflict only in this task’s bookkeeping file, which close-out resolves.

The settled Mission Control capture is readable and route-matched, though a toast overlaps the title. The recorded console has no errors. Loading-state captures were explicitly waived.

## Suggestions (non-blocking)

Follow-up #1078 covers per-view timing, board breakpoints, motion settings and cache seeding under the accepted scope.

## Verdict

needs some work — The shell transition removes the static header and does not cross-fade.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-10T07:44:28.374Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

