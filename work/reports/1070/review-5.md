---
task: "1070"
pass: 5
at: "2026-11-09T12:37:12.784Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/first-load-skeletons-match-every-page-s-
state: ok
tree_identity: "08f061d2f:08f061d2f"
---
## Verdict
needs some work — the uncommitted worktree edits would regress Mission Control to six blocks, and board breakpoints and motion settings are off-spec

## Relevance
still relevant — Mission Control's auto-fit card grid and the Stories mismatch are still on main, so the premise holds.

## Evidence
None. The one handoff capture is a settled `/` page from 08f061d2f. `src/` and `tests/` are identical between 08f061d2f and ee26b6595, so it is current. It shows a settled page, not a loading state, which the owner has accepted. I did not run tests, per the brief.

## Bugs
1. **Dirty worktree contradicts the reviewed commit (class: uncommitted state).** `PageSkeleton.vue` and `loading-skeleton.ts` have uncommitted edits. They use `LOADING_SKELETON_ITEM_COUNTS` with `dashboard: 6`, `table: 5`, `cards: 3`, `targets: 2`, `deployments: 3` and matrix `4`. If committed, Mission Control draws six stacked blocks and Checks/Secrets draw five rows, which is the regression the engineer's report says was removed. The reviewed commit ee26b6595 does not contain these edits. Discard them or reconcile them before landing.
2. **Named counts for non-board kinds are missing (criterion 3, owner's explicit ask).** Committed `loading-skeleton.ts` has only `REPRESENTATIVE_SKELETON_BLOCKS = ["representative"]`. The rendered-count test at `app-loading-skeleton.test.ts:172` compares every non-board kind to that array's length, so it asserts 1 for each kind rather than checking a real layout constant.
3. **Board breakpoint mismatch (criterion 1/2).** The real `.board` (used by `WorkView.vue:468` and `InputsView.vue:417`) becomes a 3-column grid at ≤1250px (`style.css:2073-2078`). The skeleton keeps six (`--skeleton-cols`) until 760px, so medium widths show six placeholder columns that then become three.
4. **Existing motion settings not reused (spec).** `PageSkeleton` runs an unconditional pulse. It ignores `activityAnimationConcurrency` and the page-visibility and IntersectionObserver gating in `useActivityMotion`, which `ActivityIndicator.vue` uses.
5. **Cache hits may still draw the skeleton (class: cache seeding).** Only `SecretsView` seeds from `getCachedPageData`, and only the environment list. The other views that call `refreshPageData` (Checks, Releases, Deployments, Dev, Agents, CheckRuns) gate on local refs that start empty. A revisit within five minutes may still show the skeleton. I did not verify this in a browser.

## Edge cases
- Shell timing is correct: `repo.loading` is set once and cleared once, timers clear on unmount, and reduced motion is behavioural.
- The Node/npm/npx grep over the diff is clean.
- `merge-tree` was not re-run, per the landing checklist. The checklist shows only the task file conflicting.

## Suggestions
- Mission Control's real page is a usage panel and a resources panel (see the screenshot). A single block is allowed by the spec, but a closer shape is a follow-up.
- Stories is a vertical stack of story cards, so one row is a minimal, acceptable shape.
- Remove the unrelated `[id="setting-localChecks.reclaimGraceMs"]` rule in `style.css` (~line 9660). It belongs in its own task.
- Per-view show-delay and exit timing stay with follow-up #1078, per the owner's scope.

## Verdict
needs some work — the uncommitted worktree edits would regress Mission Control to six blocks, and board breakpoints and motion settings are off-spec

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-09T12:34:44.016Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

