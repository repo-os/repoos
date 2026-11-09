---
task: "1070"
pass: 4
at: "2026-11-09T11:37:32.179Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/first-load-skeletons-match-every-page-s-
state: ok
tree_identity: "8eda4fd15:d4f6fe8c4"
---
## Verdict
needs some work — every non-Settings placeholder count is dead (always 1), and per-view skeletons overlap content for 140 ms on exit

## Relevance
still relevant — Mission Control's auto-fit card grid and the Stories mismatch are still on main, so the premise holds.

## Evidence
None. The only handoff capture is a settled Mission Control page at d4f6fe8c4. Since then the only source change is an unrelated `style.css` rule, and the owner dropped loading-state shots, so this is not a blocker.

## Bugs
1. **Count class: bound counts read the collection the skeleton is gated on, so they always resolve to 1.** The skeleton only shows while its collection is empty, so `count` is 0 and `Math.max(REPRESENTATIVE_SKELETON_BLOCKS.length, count)` returns 1. Instances: `ChecksView.vue:428` (`steps`), `CheckRunsPanel.vue:306` (`runs`), `RemindersPanel.vue:161`, `ScheduledTasksPanel.vue:346`, `ModelProvidersPanel.vue:281`, `AgentsView.vue:737` (`localAgents`) and `:954` (`detectRows`), `ReleasesView.vue:1054` (`Number(Boolean(status))`, a meaningless expression) and `:1250` (`distribution`), `DeploymentsView.vue:362` (`services` and `matrixCount` from `status?.branches`), `DevView.vue:385` (`targets`), `SecretsView.vue:540` (`snapshot?.keys`). Criterion 3 is not met: a 12-row checks plan shows one row. Only Settings (`GENERAL_FIELD_SECTIONS.length`) and the board columns carry real counts.
2. **Count class: the tests cannot catch this.** `app-loading-skeleton.test.ts:91-131` regex-matches the `:count=` strings in the source. It asserts the binding text exists, not that it yields a meaningful count. Criterion 5's per-kind test only checks the component against its own representative constant.
3. **Transition-leave class: the placeholder stays in flow during its fade.** `PageSkeleton.vue` wraps the root in `<Transition>` with only an opacity leave. In every non-`defer` call site, the real content renders in the same tick while the skeleton stays in flow for 140 ms, then collapses, so content jumps. Instances: all 13 per-view `<PageSkeleton>` tags listed in bug 1. The shell is not affected, because its wrapper is removed in the same tick.

## Edge cases
- Shell timing is correct: `repo.loading` is set true once and false once, and the wrapper's `v-if` keeps the skeleton mounted through the minimum window. Timers are cleared on unmount.
- Reduced motion is behavioural (a `matchMedia` stub asserts the class), and the listener is optional-chained for older mocks.
- Per-view skeletons remain immediate, as the owner's accepted scope allows.

## Suggestions
- Report the per-view delay and minimum as a follow-up task, per the owner's scope.
- Remove the `[id="setting-localChecks.reclaimGraceMs"] .setting-desc` rule in `style.css`. It is an unrelated, ID-specific fix and belongs in its own task.
- Re-capture the settled Mission Control page on the final tree if you want a current visual. It is optional.

## Verdict
needs some work — every non-Settings placeholder count resolves to 1 and per-view skeletons overlap content for 140 ms on exit

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-09T11:35:50.563Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

