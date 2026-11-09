---
task: "1070"
pass: 1
at: "2026-11-09T06:11:26.855Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/first-load-skeletons-match-every-page-s-
state: ok
tree_identity: "446009615:1188ab6c4"
---
## Verdict
**needs some work** — aria-busy accessibility attribute missing during forced loading shots.

## Relevance
**still relevant** — the task's premise holds and the implementation correctly addresses the core issue of mismatched skeleton layouts.

## Evidence
None.

## Bugs

**Accessibility: aria-busy not set during forced loading shots** (App.vue line 203)  
During `forcedLoadingShot`, the page-loading region displays PageSkeleton (line 211 shows `v-if="showRepoSkeleton || forcedLoadingShot"`), but aria-busy is only conditional on `showRepoSkeleton` (line 203: `:aria-busy="showRepoSkeleton ? 'true' : undefined"`). When the shot URL contains `?shotState=loading:dashboard` or `?shotState=loading:stories`, the skeleton renders but aria-busy remains unset, creating an inconsistency. Should be `:aria-busy="(showRepoSkeleton || forcedLoadingShot) ? 'true' : undefined"`. This affects screenshot/demo scenarios; real loading still works correctly since aria-busy is set after the 180ms delay. PageSkeleton's own `role="status"` and `aria-live="polite"` provide fallback accessibility.

## Edge cases

Timing edge case verified: if load completes in <180ms, skeleton never shows and skeletonShownAt is never set, but the remaining-time math (line 73: `350 - (Date.now() - skeletonShownAt)`) would use 0 if tested — however, the guard on line 72 (`if (!showRepoSkeleton.value) return`) prevents this from executing. ✓

Cleanup: timers are cleared on component unmount (lines 180–181) and when loading state changes (lines 59–62). ✓

Rapid loading toggles: new timers override pending ones on each state change. ✓

## Suggestions

Test coverage for aria-busy during forced shots would catch this inconsistency. The tests verify template structure but not attribute values under all conditions.

Human sign-off is required before merging due to the aria-busy issue and to confirm the captured skeleton screenshots (2 PNGs) match the intended Mission Control and Stories loading states.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-09T06:09:04.578Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

