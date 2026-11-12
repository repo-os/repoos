---
task: "1078"
pass: 1
at: "2026-11-12T15:23:59.385Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/per-view-skeletons-apply-the-show-delay-
state: ok
tree_identity: "2d9b5b6ee:52d157eea"
---
## Verdict
`good to go` — Default `defer: true` on `PageSkeleton` applies the existing shell gate to every listed callsite without per-view timers.

## Relevance
`still relevant` — Per-view skeletons still opted out via `defer: false`; flipping the default matches the spec and closes the #1070 follow-up.

## Evidence
None

## Bugs
None found

## Edge cases
Synchronous `refreshPageData` cache delivery still clears `loading` before `SKELETON_SHOW_DELAY_MS`, so revisits should stay skeleton-free without extra view seeding. `defer: false` remains the escape hatch; no callsite uses it today. Shell `App.vue` keeps explicit `defer` (redundant, harmless).

## Suggestions
Handoff PNG (`/checks?tab=runs`) shows settled “No recorded runs yet”, not a visible `.page-skeleton`—consistent with fast/cache-clear behavior but weak proof for the shot label; a pinned loading fixture would help human review. `app-loading-skeleton.test.ts` callsite test duplicates the same `:loading=` assertion twice (should assert absence of per-view `defer` or drop the duplicate). `check-runs-panel.test.ts` advances `SKELETON_SHOW_DELAY_MS` twice; one advance suffices. #1070 items (a)(b)(d) remain out of scope. Task-file-only merge conflict per landing checklist; close-out resolves from `main`. No new bare `node`/`npm`/`npx` in the diff.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-12T15:23:01.034Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

