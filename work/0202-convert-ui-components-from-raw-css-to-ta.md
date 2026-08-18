---
id: "0202"
title: Convert Vue SFCs from raw CSS to Tailwind utility classes
type: chore
status: active
needs_merge: true
priority: p3
area: ui
assigned_to: ai
created_by: ""
branch: feat/convert-vue-sfcs-from-raw-css-to-tailwin
model_override: default
pm_model_override: default
created_at: "2026-08-14T16:06:37Z"
updated_at: "2026-08-18T14:11:31Z"
review_rounds: 1
---
## Problem

The Vue SFCs under `src/ui-app/` use a mix of raw CSS in `<style>` blocks, shared CSS files, and inline `style=` attributes. Styling has no single source of truth, so a change can need edits in three places and the design themes drift apart.

## Desired UX

No visible change. Styling is expressed in Tailwind v4 utility classes in `class=`, with `<style scoped>` reserved for animations and genuinely custom overrides.

## Scope

**Every `.vue` file** under `src/ui-app/src/` must be converted (49 files total):

### Views (6)
- `src/ui-app/src/views/ContextView.vue`
- `src/ui-app/src/views/DashboardView.vue`
- `src/ui-app/src/views/ProductManagerView.vue`
- `src/ui-app/src/views/WorkView.vue`
- `src/ui-app/src/views/SettingsView.vue`
- `src/ui-app/src/views/AgentsView.vue`

### App root (1)
- `src/ui-app/src/App.vue`

### Components (37)
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
- `src/ui-app/src/components/CTOPanel.vue`
- `src/ui-app/src/components/RestartTaskDialog.vue`
- `src/ui-app/src/components/UsagePanel.vue`

### UI primitives (5+)
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

- [ ] Audit all 49 .vue files listed above for raw CSS usage (inline `style=`, `<style>` blocks, imported CSS classes)
- [ ] Convert layout/typography/spacing/borders/colors to Tailwind utility classes in `class=`
- [ ] Keep `<style scoped>` only for `@keyframes` animations, CSS transitions not expressible as utilities, and genuinely custom overrides
- [ ] Remove any shared CSS files or `<style>` blocks that become redundant after conversion
- [ ] Verify dark mode (`dark:`) variants and theme CSS variables still work
- [ ] Verify design themes (classic, clear, genz) are unaffected
- [ ] Run `repoos check` before moving to review

## Notes for AI

- This is a refactor: no visual or behavioural change is intended. Screenshot diffs should be empty.
- Work through the files systematically — views first, then components, then UI primitives.
- If a file is already mostly Tailwind, still audit it fully for any remaining raw CSS.
- Use `dark:` prefix for all dark-mode styles. Theme variables (`var(--*)`) should stay where they reference design tokens.

## Activity

- 2026-08-18T05:47:11Z · body
- 2026-08-18T06:27:10Z · status review→active
