---
task: "1070"
pass: 3
at: "2026-11-09T08:38:04.244Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/first-load-skeletons-match-every-page-s-
state: ok
tree_identity: "950966aaa:950966aaa"
---
## Verdict
needs some work — per-view skeletons skip the 180/350 ms gate, Settings lost its row count, and the non-board counts are still magic numbers

## Relevance
still relevant — Mission Control's auto-fit card grid and Stories' mismatch are still present on main, so the premise holds.

## Evidence
None. The only handoff capture is a settled Mission Control page from 950966aaa, and the only tree change since then is bookkeeping. The owner's scope drops loading-state shots, so no evidence gap applies.

## Bugs
1. **Timing gate is not applied to per-view skeletons.** The 180 ms delay and 350 ms minimum live only in `App.vue`. Twelve call sites still render `PageSkeleton` the moment `loading && !data` is true: `ChecksView.vue:428`, `SecretsView.vue:527`, `SettingsView.vue:1226`, `AgentsView.vue:737` and `:954`, `ReleasesView.vue:1054` and `:1250`, `DeploymentsView.vue:362`, `DevView.vue:385`, `CheckRunsPanel.vue:306`, `RemindersPanel.vue:161`, `ScheduledTasksPanel.vue:346`, `ModelProvidersPanel.vue:281`. A fast load flashes a skeleton, which criterion 4 forbids. Fix: put the gate inside `PageSkeleton` so every call site inherits it.
2. **Settings row count regressed.** `rows` dropped from 5 to 1 (`LOADING_SKELETON_ITEM_COUNTS` and `PageSkeleton.vue` `itemCount`). That also affects `SettingsView.vue:1226` and the three panels above. Settings is a long list of grouped rows, so one row is a wrong shape, not a minimal one.
3. **Counts are hard-coded, not derived from the real content (criterion 3).** `table: 5`, `cards: 3`, `targets: 2`, `deployments: 3`, `dashboard: 1`, `rows: 1` in `src/ui-app/src/lib/loading-skeleton.ts` are literals, not taken from the views' data. Only the board kinds use live constants. The same literal `return 1` sits in `PageSkeleton.vue` `itemCount`.
4. **Item-count test is tautological (criterion 5).** `app-loading-skeleton.test.ts` compares the component against `LOADING_SKELETON_ITEM_COUNTS`, the same table it reads. It cannot catch drift from the real pages. The reduced-motion test is a regex over the source, not a behaviour check.

## Edge cases
- `repo.loading` is set true once (`stores/repo.ts:715`) and only ever set false (`:4443`), so background refreshes cannot bring the shell skeleton back. The shell timers are cleared on unmount.
- The R1 `aria-busy` finding is fixed: the forced-shot hook is gone and `aria-busy` is set only from `showRepoSkeleton`.
- The Mission Control capture is the settled page. It is a single full-width panel stack at 1024 px, which fits a single-block skeleton.

## Suggestions
- Mission Control is really several stacked panels (usage, resources, processes). One 220 px block is a reasonable placeholder, but a closer multi-panel shape could be a follow-up.
- `shot-fixtures.ts:149` drops the `#0950` comment above `dev:loading` for no reason. Restore it.
- Consider a settled Stories capture so the `rows` shape has real evidence behind it.

## Handoff UI verification
One auto capture of the settled `/` page, route matched, zero console errors recorded.

## Automated verification
- Browser console-error check (handoff evidence): passed (per handoff record).
- Guard negative-test evidence: not reported in this pass.

## Verdict
(see top; repeated below for parsing)

needs some work — per-view skeletons skip the 180/350 ms gate, Settings lost its row count, and the non-board counts are still magic numbers

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-09T08:37:06.644Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

