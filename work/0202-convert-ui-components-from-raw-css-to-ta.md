---
id: "0202"
title: Convert UI components from raw CSS to Tailwind utility classes
type: chore
status: inbox
priority: p3
area: ui
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-08-14T16:06:37Z"
updated_at: "2026-08-14T16:06:37Z"
---
The Vue SFCs under src/ui-app/ use a mix of raw CSS in `<style>` blocks, shared CSS files, and inline `style=` attributes. Migrate them to Tailwind v4 utility classes in `class=` for a single-source-of-truth styling approach.

- [ ] Audit all .vue files for raw CSS usage
- [ ] Convert layout/typography/spacing to Tailwind utilities
- [ ] Keep `<style scoped>` only for animations and truly custom overrides
- [ ] Verify dark mode (`dark:`) and theme variables still work
- [ ] Verify design themes (classic, clear, genz) are unaffected
- [ ] Run `repoos check` before moving to review

## Activity

- 2026-08-14T16:06:37Z · created · unknown
