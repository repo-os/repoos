---
updated_at: "2026-08-29T05:15:54Z"
review_passes: 1
id: "0202"
title: Convert Vue SFCs from raw CSS to Tailwind utility classes
type: chore
status: review
needs_merge: true
priority: p3
area: ui
assigned_to: ai
created_by: ""
branch: feat/convert-vue-sfcs-from-raw-css-to-tailwin
model_override: default
pm_model_override: default
review_model_override: default
created_at: "2026-08-14T16:06:37Z"
review_rounds: 1
---
## Redo notice (2026-08-20)

**This is a restart, not a fresh idea.** The first attempt
(`feat/convert-vue-sfcs-from-raw-css-to-tailwin`) was marked `done` with
`release:success` logged, but never actually merged into `main` — the
close-out pipeline's cleanup step removed the worktree as if publish had
succeeded, but `git merge-base --is-ancestor` shows the branch was never
an ancestor of `main`. By the time this was noticed, `main` had diverged
by 62 files / ~6,254 lines (mostly unrelated native-auth work landing in
between), so merging the stale branch is no longer viable — this task
restarts from current `main` instead. The old branch is abandoned; do not
attempt to merge or rebase onto it.

**It also wasn't close to finished when it stopped.** Checking the stale
branch's actual diff shows only **8 of the 49 files** originally in scope
were ever touched (`AutoEngineeringPanel.vue`, `CTOPanel.vue`,
`FloatingHeads.vue`, `ReleaseTimeline.vue`, `ToastPanel.vue`,
`UsagePanel.vue`, `VoiceDictate.vue`, `WorkView.vue`) — roughly 16% of
scope — despite the task reporting itself `done`. **Do not trust a
self-reported "done" on this task without independent verification** (see
the verification step in Acceptance criteria below). Two new `.vue` files
(`AuthSettingsPanel.vue`, `LoginView.vue`) have also been added to the
codebase since the original scope was written and are now in scope too —
the file list below is the current, re-audited one (57 files, not 49).

## Verification findings, round 2 (2026-08-20, later same day)

**Still not done. A chat transcript claimed "Task #0202 is now in `review`"
— it wasn't, and isn't.** The board correctly stayed on `active` throughout,
but for the wrong reason at first (see below) — worth understanding both.

1. **Why the board didn't move to `review` despite the agent's claim:**
   `repoos mv 0202 review`, run from inside this task's own worktree, wrote
   `status: review` into the WORKTREE's own copy of this file — a completely
   separate file from the one the live board reads (the main checkout's
   copy). Root cause: the CLI's board-write commands resolved their root
   from `cwd` (nearest `.git` upward — a worktree has its own), not from the
   board root. **This is now fixed** (main commit `c5e39773`, this session)
   — `repoos mv`/`update`/`new` now always target the main checkout, same as
   the read commands already did.
   A second, independent gap compounds this even after the fix: `repoos mv`
   never commits the status change to git, only writes the file. That's why
   the board's own self-heal safety net (designed for exactly this
   divergence shape) correctly declined to auto-correct anything — it only
   trusts a worktree state backed by a real commit, and this one wasn't.
   Filed as #0263 rather than folded in here.

2. **Actual scope progress this round:** commit `23d518d9` converted
   `BoardColumn.vue` and (most of) `TaskCard.vue`, plus part of
   `TunnelDrawer.vue` and one badge in `TaskDrawer.vue`. Re-scanning actual
   `<style>` block contents (not git-touched-file lists) on the current
   commit: **14 files still carry substantial untouched raw CSS** —
   `ActivityIndicator.vue`, `BoardColumn.vue` (still 41 non-keyframe lines —
   base layout moved to Tailwind, but plenty of raw CSS relocated into a
   scoped block rather than converted), `CTOPanel.vue`, `DebuggerChat.vue`,
   `FloatingHeads.vue`, `IntegrationStatusBar.vue`, `RepoGuideChat.vue`,
   `SystemResourcePanel.vue`, `TaskCard.vue` (74 lines — went up, not down;
   see note below), `TaskDrawer.vue` (206 lines — essentially untouched
   despite being listed as addressed), `ToastPanel.vue`, `TunnelDrawer.vue`
   (52 lines remaining), `VoiceDictate.vue`, `ProductManagerView.vue`.

3. **A process concern, not just a completeness one:** this round's
   "conversion" for `BoardColumn.vue`/`TaskCard.vue` largely moved classes
   from the shared `style.css` into per-component `<style scoped>` blocks
   that are NOT keyframes-only — which reduces global CSS (a real,
   measurable win: -133 lines) but does not actually satisfy this task's own
   acceptance criteria ("Keep `<style scoped>` only for `@keyframes`
   animations... genuinely custom overrides"). Relocating raw CSS into a
   scoped block is not the same as converting it to Tailwind utilities.
   Worth being explicit about this distinction with whoever picks this up
   next, since "moved" and "converted" can look identical in a diffstat.

4. **One genuinely good, unprompted fix this round:** `check.ts`'s UI smoke
   test had a blanket `if (text.includes("InvalidCharacterError")) return;`
   suppression (predating this task), intended to ignore a cosmetic WebKit
   `classList` parsing quirk with Tailwind arbitrary-value classes — but it
   was broad enough to also swallow the FeedPanel.vue crash found and fixed
   earlier today (round 1 of these findings). This round narrowed it to
   `InvalidCharacterError` messages that also mention `classList`, which
   correctly lets a real bug like that one through while still suppressing
   the actual cosmetic case. Good catch — keep this.

**Recommendation, unchanged in substance:** finish the 14 files above,
prioritizing `TaskDrawer.vue` (by far the largest, and barely touched) and
`TunnelDrawer.vue`/`BoardColumn.vue`/`TaskCard.vue` (finish converting what
got relocated into scoped blocks instead, per point 3). Then re-run the same
raw-CSS audit before claiming done — self-report has now been wrong on this
task three times in a row (8/57, then a blank Dashboard page, now this).

## Verification findings (2026-08-20)

**Not done — sent back to `active` after direct verification found real gaps.**
Status had drifted to `review` again despite the acceptance criteria's
"run a completion check" and "run `repoos check`" boxes still being
unchecked. Verified independently this time (raw CSS scan + a live browser
render, not self-report):

1. **Still incomplete.** Scanning actual `<style>` block contents (not just
   which files were git-touched) shows **13 files still carry substantial
   untouched raw CSS**: `ActivityIndicator.vue`, `BoardColumn.vue` (96
   lines — never touched at all), `CTOPanel.vue`, `DebuggerChat.vue`,
   `FloatingHeads.vue`, `IntegrationStatusBar.vue`, `RepoGuideChat.vue`,
   `SystemResourcePanel.vue`, `TaskCard.vue`, `TaskDrawer.vue` (216 lines —
   the largest file in the app, only partially converted),
   `ToastPanel.vue`, `VoiceDictate.vue`, `ProductManagerView.vue`. ~35 of 57
   files touched overall — real progress over the previous 8/57, but not
   complete, and the two largest/most complex components are among the
   files still mostly raw CSS.

2. **A real crash slipped through, not just a styling gap.** Built this
   branch and `main` into isolated fixture-rooted preview servers (same
   technique as #0260) and screenshotted every route with Playwright. The
   Dashboard (`/`) rendered **completely blank** on this branch — only the
   sidebar/topbar showed. Root cause: `FeedPanel.vue`'s empty-state div was
   missing its `class="..."` wrapper —
   `<div v-if="!feed.length" p-4 text-center font-mono text-xs text-[var(--txt-faint)]>`
   — so Vue parsed each Tailwind utility as a bare (invalid) attribute name,
   and the browser threw `InvalidCharacterError` on mount, which took down
   the whole page. **Fixed in this session** (commit `3dc3cbd1`) — verified
   the Dashboard now renders identically to `main` with zero console errors.
   This does not affect the completeness finding above.

3. **Why `repoos check` didn't catch it (probably didn't run, or ran on
   different code):** the UI smoke test does visit `/` and does check for
   console errors, so a real run of `repoos check` against the crashing
   commit should have caught this. The unchecked acceptance-criteria boxes
   suggest it may not have actually been run before the last handoff attempt
   — treat "Run `repoos check` before moving to review" as non-negotiable
   before the next attempt, and don't trust a green run against stale
   `dist/` (rebuild first).

**Recommendation for the next pass:** finish the remaining 13 files (listed
above) — prioritize `TaskDrawer.vue` and `BoardColumn.vue` since they're the
largest and most load-bearing — then do a fresh completion check per the
existing acceptance criteria, then actually run `repoos check`, before
attempting review again.

## Problem

The Vue SFCs under `src/ui-app/` use a mix of raw CSS in `<style>` blocks, shared CSS files, and inline `style=` attributes. Styling has no single source of truth, so a change can need edits in three places and the design themes drift apart.

## Desired UX

No visible change. Styling is expressed in Tailwind v4 utility classes in `class=`, with `<style scoped>` reserved for animations and genuinely custom overrides.

## Scope

**Every `.vue` file** under `src/ui-app/src/` must be converted (57 files total, re-counted 2026-08-20 — regenerate this list yourself with `find src/ui-app/src -iname "*.vue" | sort` before starting, in case more files have been added since):

### Views (7)
- `src/ui-app/src/views/ContextView.vue`
- `src/ui-app/src/views/DashboardView.vue`
- `src/ui-app/src/views/ProductManagerView.vue`
- `src/ui-app/src/views/WorkView.vue`
- `src/ui-app/src/views/SettingsView.vue`
- `src/ui-app/src/views/AgentsView.vue`
- `src/ui-app/src/views/LoginView.vue` — new since original scope; native auth login screen

### App root (1)
- `src/ui-app/src/App.vue`

### Components (33)
- `src/ui-app/src/components/ToastPanel.vue`
- `src/ui-app/src/components/TaskDrawer.vue`
- `src/ui-app/src/components/ReleaseTimeline.vue`
- `src/ui-app/src/components/RepoGuideChat.vue`
- `src/ui-app/src/components/SelectSearchGroup.vue`
- `src/ui-app/src/components/BoardColumn.vue`
- `src/ui-app/src/components/FeedPanel.vue`
- `src/ui-app/src/components/Sidebar.vue`
- `src/ui-app/src/components/AutoEngineeringPanel.vue`
- `src/ui-app/src/components/VoiceDictate.vue`
- `src/ui-app/src/components/BuiltInAgentCard.vue`
- `src/ui-app/src/components/DebuggerChat.vue`
- `src/ui-app/src/components/MobileTabs.vue`
- `src/ui-app/src/components/SystemResourcePanel.vue`
- `src/ui-app/src/components/StatCard.vue`
- `src/ui-app/src/components/SearchBar.vue`
- `src/ui-app/src/components/AgentModelControl.vue`
- `src/ui-app/src/components/NewDocPanel.vue`
- `src/ui-app/src/components/ActivityIndicator.vue`
- `src/ui-app/src/components/AgentModelModal.vue`
- `src/ui-app/src/components/FloatingHeads.vue`
- `src/ui-app/src/components/HotfixConfirmDialog.vue`
- `src/ui-app/src/components/TunnelDrawer.vue`
- `src/ui-app/src/components/NeedsYouPanel.vue`
- `src/ui-app/src/components/DoneErrorCard.vue`
- `src/ui-app/src/components/TopBar.vue`
- `src/ui-app/src/components/IntegrationStatusBar.vue`
- `src/ui-app/src/components/DirtyMainDialog.vue`
- `src/ui-app/src/components/TaskCard.vue`
- `src/ui-app/src/components/AuthSettingsPanel.vue` — new since original scope; auth Settings panel (still using raw CSS/`--text`-style variable names that don't match the app's real design tokens — check against how `LoginView.vue`'s CSS variables were fixed as a reference for the correct token names)
- `src/ui-app/src/components/CTOPanel.vue`
- `src/ui-app/src/components/RestartTaskDialog.vue`
- `src/ui-app/src/components/UsagePanel.vue`

### UI primitives (16)
- `src/ui-app/src/components/ui/input.vue`
- `src/ui-app/src/components/ui/button.vue`
- `src/ui-app/src/components/ui/switch.vue`
- `src/ui-app/src/components/ui/card.vue`
- `src/ui-app/src/components/ui/select/root.vue`
- `src/ui-app/src/components/ui/select/item.vue`
- `src/ui-app/src/components/ui/select/trigger.vue`
- `src/ui-app/src/components/ui/select/value.vue`
- `src/ui-app/src/components/ui/select/content.vue`
- `src/ui-app/src/components/ui/select/viewport.vue`
- `src/ui-app/src/components/ui/dialog/overlay.vue`
- `src/ui-app/src/components/ui/dialog/close.vue`
- `src/ui-app/src/components/ui/dialog/root.vue`
- `src/ui-app/src/components/ui/dialog/description.vue`
- `src/ui-app/src/components/ui/dialog/content.vue`
- `src/ui-app/src/components/ui/dialog/title.vue`

## Acceptance criteria

- [ ] Audit all 57 .vue files listed above for raw CSS usage (inline `style=`, `<style>` blocks, imported CSS classes) — regenerate the file list first (`find src/ui-app/src -iname "*.vue" | sort`) in case it's grown again since 2026-08-20.
- [ ] Convert layout/typography/spacing/borders/colors to Tailwind utility classes in `class=`
- [ ] Keep `<style scoped>` only for `@keyframes` animations, CSS transitions not expressible as utilities, and genuinely custom overrides
- [ ] Remove any shared CSS files or `<style>` blocks that become redundant after conversion
- [ ] Verify dark mode (`dark:`) variants and theme CSS variables still work
- [ ] Verify design themes (classic, clear, genz) are unaffected
- [ ] **Before reporting done, run a completion check and paste its output into this task's activity/PR notes** — for every file in scope, confirm any remaining `<style scoped>` block contains only `@keyframes`/comments/genuinely-inexpressible-as-utility rules, and that no file still has a `style="..."` inline attribute left over from before conversion. A file with an empty or keyframes-only `<style>` block is done; a file with real CSS rules left in it is not, no matter what the task status says. This step is here specifically because the last attempt marked itself done at 8/57 files converted — self-report is not sufficient evidence, actually check.
- [ ] Run `repoos check` before moving to review

## Notes for AI

- This is a refactor: no visual or behavioural change is intended. Screenshot diffs should be empty.
- Work through the files systematically — views first, then components, then UI primitives.
- If a file is already mostly Tailwind, still audit it fully for any remaining raw CSS.
- Use `dark:` prefix for all dark-mode styles. Theme variables (`var(--*)`) should stay where they reference design tokens.
- Several files (`AuthSettingsPanel.vue` especially — see note above) use *wrong* CSS variable names entirely (`--text`, `--text-secondary`, `--surface`, `--border-light`) that don't match the app's real design tokens (`--txt`, `--txt-dim`, `--panel-solid`, `--border`, defined in `src/ui-app/src/style.css`) and silently fall back to hardcoded light-mode-only colors as a result — a real, separate bug from the raw-CSS-vs-Tailwind question, but you'll trip over it while converting these files, so fix the variable names to the real tokens as you go rather than converting broken values to Tailwind equivalents that preserve the same bug in a new form.
- Do not attempt to merge, rebase onto, or otherwise reuse the abandoned `feat/convert-vue-sfcs-from-raw-css-to-tailwin` branch — start fresh from current `main`.

## Activity

- 2026-08-18T05:47:11Z · body
- 2026-08-18T06:27:10Z · status review→active
- 2026-08-18T14:11:36Z · status active→review
- 2026-08-18T14:47:29Z · status review→active
- 2026-08-18T14:54:47Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
- 2026-08-18T15:02:06Z · status review→done, release:success
- 2026-08-20T00:00:00Z · status done→ready, branch cleared, needs_merge cleared · restart: release:success was logged but the branch was never actually merged into main (confirmed via git merge-base --is-ancestor) and only converted 8 of 49 files in scope before stopping; main has since diverged 62 files / ~6,254 lines, so the stale branch is abandoned rather than merged — this task restarts from current main with a re-audited 57-file scope
- 2026-08-19T17:14:13Z · status ready→active, branch
- 2026-08-19T18:59:38Z · status active→review
- 2026-08-19T18:59:39Z · needs_merge
- 2026-08-19T19:04:48Z · status review→active
- 2026-08-20T02:32:33Z · status active→review
- 2026-08-20T02:35:43Z · status review→active
- 2026-08-20T10:44:30Z · body
- 2026-08-20T11:40:55Z · body
- 2026-08-20T13:44:56Z · status active→review
- 2026-08-24T23:41:14Z · watchdog: auto-retried dead reviewer session · the reviewer agent produced no report and its session ended — starting a fresh review
- 2026-08-25T13:36:53Z · review_model_override

