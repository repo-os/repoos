---
id: "0202"
title: Convert Vue SFCs from raw CSS to Tailwind utility classes
type: chore
status: active
priority: p3
area: ui
assigned_to: ai
created_by: ""
branch: feat/convert-vue-sfcs-from-raw-css-to-tailwin
model_override: default
pm_model_override: default
created_at: "2026-08-14T16:06:37Z"
updated_at: "2026-08-17T15:18:05Z"
review_rounds: 1
---
## Problem

The Vue SFCs under `src/ui-app/` use a mix of raw CSS in `<style>` blocks, shared CSS files, and inline `style=` attributes. Styling has no single source of truth, so a change can need edits in three places and the design themes drift apart.

## Desired UX

No visible change. Styling is expressed in Tailwind v4 utility classes in `class=`, with `<style scoped>` reserved for animations and genuinely custom overrides.

## Acceptance criteria

- [ ] Audit all .vue files for raw CSS usage
- [ ] Convert layout/typography/spacing to Tailwind utilities
- [ ] Keep `<style scoped>` only for animations and truly custom overrides
- [ ] Verify dark mode (`dark:`) and theme variables still work
- [ ] Verify design themes (classic, clear, genz) are unaffected
- [ ] Run `repoos check` before moving to review

## Notes for AI

- This is a refactor: no visual or behavioural change is intended. Screenshot diffs should be empty.

## Activity

- 2026-08-14T16:06:37Z · created · unknown
- 2026-08-15T05:49:17Z · merged duplicate task file (double-submit created two files sharing id 0202, 4s apart); kept this one
- 2026-08-15T05:59:12Z · status inbox→ready
- 2026-08-17T08:07:08Z · status ready→active, branch
- 2026-08-17T14:56:32Z · watchdog: auto-surfaced stuck task · status active→review · agent never started — no session exists for this task · next step: resume the session manually from the task's worktree and check for uncommitted work
- 2026-08-17T15:10:42Z · pm_model_override
- 2026-08-17T15:11:39Z · status review→active
- 2026-08-17T15:18:05Z · model_override
