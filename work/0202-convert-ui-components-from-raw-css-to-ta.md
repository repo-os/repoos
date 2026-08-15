---
id: "0202"
title: Convert Vue SFCs from raw CSS to Tailwind utility classes
type: chore
status: ready
priority: p3
area: ui
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-14T16:06:37Z"
updated_at: "2026-08-15T05:59:12Z"
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
