---
task: "1070"
pass: 6
at: "2026-11-09T14:27:54.923Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/first-load-skeletons-match-every-page-s-
state: ok
tree_identity: "9fd844e05:9fd844e05"
---
Repeated review classes: the uncommitted six-block regression and the placeholder-count gap from pass 5 are fixed (worktree clean, named counts in `LOADING_SKELETON_ITEM_COUNTS`), and the board breakpoint now matches `style.css:2073`. The motion gap from pass 5 is not fixed. The unconditional pulse was removed and the gated hook it now depends on never engages, so the skeleton is static. Cache seeding is still Secrets-only, which is accepted under #1078. A human should look at the recurring pattern: each pass fixes the named item while a neighbouring rule goes inert, and the tests assert absence (no `motion-active`) rather than presence.

## Verdict
needs some work — the skeleton shimmer never engages because its motion hook is wired to a ref that is null at mount; the tests pass only on the absence of motion.

## Relevance
still relevant — Mission Control's auto-fit card grid and the Stories mismatch are still the premise, and this diff collapses both to a single block.

## Evidence
None. The one capture is a settled `/` at `9fd844e05`. Only bookkeeping changed before `b73038a18`, so it is current. It shows the real Mission Control (AI usage panel, then a tall resources panel), which is the layout the single 220px block is guessing at. The toast overlaps the title; that is unrelated. No loading-state shot, as accepted. I read the code and did not run tests.

## Bugs
1. **Motion never engages (class: ref read before a conditional render).** `PageSkeleton.vue` passes `root` into `useActivityMotion` during setup. `root` sits on a `v-if="visible"` element, and `visible` starts false, so `root` is null in the hook's `onMounted`. `activity-motion.ts` only registers an observer entry when the element exists at mount, so `animate` stays false, `page-skeleton--motion-active` never applies, and `.page-skeleton__item i` keeps `animation: none`. This removes main's pulse and adds no shimmer. `ActivityIndicator.vue:118` avoids the bug because its root is always rendered. Fix: have the hook watch the ref, or put the ref on an always-rendered wrapper.
2. **No test asserts motion is on (class: negative-only assertions).** `app-loading-skeleton.test.ts:265` checks `not.toContain("page-skeleton--motion-active")`, which passes trivially. Add a case with `matchMedia` returning false that expects the active class and the pulse rule.
3. **Global stub never restored (class: test hygiene).** The shell test "keeps the shell skeleton out of fast loads…" calls `vi.stubGlobal("fetch", …)` with no `unstubAllGlobals()`, so it leaks into later tests in the file.
4. **Contrast fixed for one row only (class: `--txt-faint` on `.setting-desc`).** `style.css:9660` overrides `localChecks.reclaimGraceMs` by id. Every `.setting-desc` (base rule and `SettingsView.vue:1315, 1336, 1369`) still uses `--txt-faint`, which the engineer reports at `#958ab0` on white in one theme. Fix the token or the base rule, or move this to its own task. This is pre-existing and off-topic for a skeleton task.

## Edge cases
- The shell's skeleton leaves abruptly, not as a cross-fade. `App.vue` removes the whole `showLoadingShell` block when visibility flips, so PageSkeleton's `<Transition>` leave likely never runs. Spec asks for a cross-fade.
- The page header renders before the 180 ms delay and is replaced on fast loads. That is static chrome, so it is acceptable.
- Per-view skeletons use `defer` false and so show without the delay gate; accepted under #1078.
- `merge-tree` per the landing checklist: only the task file conflicts; no source conflicts.
- Engineering report source matches the reviewed tree.

## Suggestions
- Row heights (`rows` 74px, `dashboard` 220px) are not measured against the real Stories and Mission Control rows; spec asks for matching heights.
- Scope the `reclaimGraceMs` contrast change to its own task.

## Verdict
needs some work — the skeleton shimmer never engages (dead motion wiring); tests assert absence and miss it.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-09T14:26:06.769Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

