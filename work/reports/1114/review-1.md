---
task: "1114"
pass: 1
at: "2026-11-14T15:51:36.113Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/build-mobile-task-details-as-a-page-or-s
state: ok
tree_identity: "02786acb8:ea049ad88"
---
## Verdict
`needs some work` — narrow `/work?task=` deep links can strip `task` before `isNarrow` is known, so mobile detail never opens for on-board tasks.

## Relevance
`still relevant` — ADR 0011’s mobile detail route and queue preservation are not fully delivered elsewhere; this branch is the right slice.

## Evidence
None

## Bugs
- **Class: responsive-layout hydration race** — `WorkView.vue` `openFromTaskParam`: the `route.query.task` watcher is `immediate: true`, but `useResponsiveLayout()` leaves `isNarrow` false until `onMounted`. On the fast local path (`repo.tasks.find`), the call can reach `if (!isNarrow.value) await clearTaskParam()` while still “desktop”, removing `task` on a phone load of `/work?task=<id>`. In-app card open is fine (layout already mounted). The API-fetch path usually awaits past mount, so it often avoids this.

No further findings of this class were found after grepping: `WorkView.vue` (`openFromTaskParam`, `clearTaskParam`, task watcher), `App.vue` (`isMobileTaskDetail`), `MobileWorkQueue.vue` (`openTask`), `MobileTaskDetail.vue`, `useResponsiveLayout.ts`.

## Edge cases
Fixture capture can keep `?task=9999` via the shot early-return path while real on-board deep links hit the race. Mobile detail exposes only start/pause/move-to-ready (no review/done/drawer tabs). No new bare `node`/`npm`/`npx` in the branch diff.

## Suggestions
Sync narrow detection (`window.innerWidth` / `matchMedia`) before the first `clearTaskParam` decision, or defer clearing until layout is initialized. Add a WorkView test for narrow cold deep link with a local task. Optional: broaden mobile actions toward drawer parity; extend tests beyond isolated `MobileTaskDetail` mounts.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-14T15:49:33.589Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

