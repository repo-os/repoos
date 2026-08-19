---
id: "0202"
title: Convert Vue SFCs from raw CSS to Tailwind utility classes
type: chore
status: review
priority: p3
area: ui
assigned_to: ai
created_by: ""
branch: feat/convert-vue-sfcs-from-raw-css-to-tailwin
model_override: default
pm_model_override: default
created_at: "2026-08-14T16:06:37Z"
updated_at: "2026-08-19T18:59:38Z"
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
