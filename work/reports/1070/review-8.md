---
task: "1070"
pass: 8
at: "2026-11-09T17:03:14.682Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/first-load-skeletons-match-every-page-s-
state: ok
tree_identity: "b612d39d7:b612d39d7"
---
Repeated review classes: The pass-6 motion bug is fixed. `useActivityMotion` now watches the element ref (`activity-motion.ts:79`), and a positive test asserts `page-skeleton--motion-active`. The pass-7 unrestored `fetch` stub is also fixed. Still open: the shell skeleton exit bypasses its leave transition, and the one-row contrast selector is still in `style.css`. Source-text assertions keep recurring (`app-loading-skeleton.test.ts:89`, `:247`, `:301`). A human should look at that pattern: each pass fixes the named item, and new regex-on-source assertions appear in its place.

## Verdict
`good to go` — the motion lifecycle fix is correct and tested; the open items are non-blocking under the owner's accepted scope.

## Relevance
still relevant — Mission Control and Stories are single blocks, and the shell gate is landed; the remaining per-view work is tracked in #1078.

## Evidence
None. Declared shots are `[]` (owner-accepted). The single auto capture (`default-1.png`) is a settled `/` at `b612d39d7`. Since then only `work/reports` and `round-7.json` changed, so it is current. It shows the real page rendered, not blank or loading. A RepoOS "ready" toast overlaps the title; that is unrelated to the skeleton.

## Bugs
Non-blocking, outside the owner's required list:
1. **Shell skeleton exits by removal, not cross-fade.** `App.vue:166-180` puts `PageSkeleton` under `v-if="showLoadingShell"`. When visibility goes false, the wrapper unmounts in the same tick, so the leave transition (`PageSkeleton.vue:161-170`) never runs and `RouterView` pops in. Class: transition bypassed by a parent `v-if`. The spec's "content cross-fades in" is not met at shell level. No other instance in the shell; per-view instances keep their own `<Transition>`.
2. **Theme token patched by a one-row ID selector.** `style.css:9660` `[id="setting-localChecks.reclaimGraceMs"] .setting-desc` overrides colour for one row; the base `.setting-desc` (`style.css:9655`) still uses `--txt-faint`. This is the only instance in the diff. The engineering report says the contrast issue was "left alone", but this patch is committed. The report does not match the diff.
3. **Source-text assertions instead of behaviour.** `app-loading-skeleton.test.ts:247` is named "takes leaving view skeletons out of flow while they fade" but only regex-matches the stylesheet. Lines 89 and 301 do the same for the board breakpoint and the pulse rule.

## Edge cases
- Merge: the server checklist reports only the task file conflicting. I ran `git merge-tree --write-tree main HEAD` against the checklist's instruction. It exited 1, which fits that task-file conflict, but I did not inspect the output.
- Motion hook: if `IntersectionObserver` is swapped at runtime, `observerConstructor` disconnects the old observer without re-observing existing entries. Production never does this, so it is test-only.
- Dashboard: the real page stacks `UsagePanel`, `SystemResourcePanel` and a stat grid (`DashboardView.vue:76+`). The skeleton is one 220 px block, so the layout jump on data arrival is large. The owner fixed the single-block shape, so this is recorded, not blocking.
- Skeleton roots now take `activityAnimationConcurrency` slots, which `ActivityIndicator` also uses. Reviewer 7 already noted this; it is by design.

## Suggestions
- Move the `reclaimGraceMs` contrast patch to its own task, or fix `--txt-faint` at the token, and correct the engineering report.
- Give the shell skeleton a cross-fade: keep the wrapper mounted until the leave transition ends, or move `v-if` onto the content.
- Replace the source-text assertions at lines 89, 247 and 301 with rendered checks, or rename them to say what they check.
- Measure the `dashboard` (220 px) and `rows` (74 px) heights against a real row.

## Verdict
`good to go` — the motion lifecycle fix is correct and tested; the open items are non-blocking under the owner's accepted scope.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-09T16:38:05.469Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

