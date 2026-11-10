---
task: "1070"
pass: 7
at: "2026-11-09T16:34:22.303Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/first-load-skeletons-match-every-page-s-
state: ok
tree_identity: "b612d39d7:9fd844e05"
---
Repeated review classes: The pass-6 motion bug is fixed. `useActivityMotion` now watches the element ref (`activity-motion.ts`, `watch(element, bindElement)`), so the shimmer binds once the `v-if` renders, and a test asserts `page-skeleton--motion-active`. The pass-6 negative-only assertion and the unrestored global stub are also fixed. The `reclaimGraceMs` contrast issue is patched with a one-row selector rather than a token fix, and the shell cross-fade gap is still open. Source-text regex tests keep recurring. A human should look at this pattern: each pass fixes the named item, and assertions drift back to source text or absence.

## Verdict
`good to go` — motion wiring is fixed and the named counts are tested; the open items are non-blocking, and the one capture is stale.
STALE-EVIDENCE-ONLY

## Relevance
still relevant — Mission Control and Stories now render single blocks, and the show-delay and minimum-time gate lives in the shell.

## Evidence
None. Declared shots are `[]`. The one auto capture is a settled `/` at `9fd844e05`. Since then only `activity-motion.ts` and a test changed, so the capture is stale. It is optional under the owner's scope.

## Bugs
1. **Shell skeleton exits by removal, not cross-fade (non-blocking, outside the owner's required list).** `App.vue:171` wraps `PageSkeleton` in `v-if="showLoadingShell"`. When visibility goes false, the whole block unmounts, so PageSkeleton's `<Transition>` leave never runs and `RouterView` pops in. Class: transition bypassed by a parent `v-if`. Only the shell has this; per-view skeletons keep their own transition.
2. **Contrast fix is a one-row ID selector (non-blocking).** `style.css` (`[id="setting-localChecks.reclaimGraceMs"] .setting-desc`) fixes one row. The base `.setting-desc` rule still uses `--txt-faint`. Class: theme token patched by selector. Off-topic for a skeleton task.
3. **Source-text assertions (non-blocking).** `app-loading-skeleton.test.ts` lines 88, 110 and 241 check CSS or source text rather than rendered behaviour. Line 241 claims the leave fades but only reads the stylesheet.

## Edge cases
- The engineering report is stale: it targets `9fd844e05`, and the motion fix that followed has no current-round report.
- `activity-motion.ts` now shares `activityAnimationConcurrency` slots with skeletons, so a loading skeleton can take a slot an `ActivityIndicator` would have used. This is by design under "reuse existing settings".
- `DeploymentsView` and `ReleasesView` now render the error and the skeleton in separate `v-if`s, so a load error shows alongside the skeleton. Minor.
- `Settings` counts `GENERAL_FIELD_SECTIONS` (6), which covers schema-driven sections only. Hand-rendered cards are not counted. Acceptable as documented.
- I did not run tests. I read the diff; the handoff gate passed, and the landing facts are server-computed.

## Suggestions
- Re-capture settled `/` and `/stories` on HEAD `b612d39d7` if the human wants visual proof; these are the captures that are stale.
- Row heights (`dashboard` 220px, `rows` 74px) are still not measured against the real rows.
- Move the `reclaimGraceMs` contrast fix to its own task, or fix `--txt-faint` at the token.

## Verdict
`good to go` — motion wiring is fixed and the named counts are tested; the open items are non-blocking, and the one capture is stale.
STALE-EVIDENCE-ONLY

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-09T14:26:06.769Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

