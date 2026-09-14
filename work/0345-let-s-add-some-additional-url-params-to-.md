---
id: "0345"
title: "Add URL params for deep-linking tasks, inputs, and settings"
type: feature
status: ready
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: ""
review_model_override: opencode-go/deepseek-v4-pro
updated_at: "2026-09-14T07:27:41Z"
---
## Problem

The app has no deep-linkable URLs for the panels users open most: a specific
task, a specific input, or a specific settings section. Every link into these
views has to be reached by manual navigation, which makes it impossible to
bookmark, share, or return directly to "task #0340" or "the notifications
setting."

## Desired UX

- `/work?task=0340` opens that task (same as clicking it from the board).
- `/work?task=new` opens the new-task panel.
- The same pattern applies to inputs (e.g. `?input=<id>` / `?input=new`) and
  anywhere else it's appropriate and useful.
- `/settings?setting=abc` scrolls to/opens the relevant setting.

## Acceptance criteria

- [ ] `/work?task=<id>` opens that task's drawer on load.
- [ ] `/work?task=new` opens the new-task panel on load.
- [ ] An equivalent `?input=<id>` / `?input=new` pattern works for inputs.
- [ ] `/settings?setting=<id>` opens/scrolls to that setting.
- [ ] Existing `?focus=` deep-linking into settings keeps working (add/alias
      `?setting=`, don't replace or break `?focus=`).
- [ ] The query param is cleared from the URL after the panel opens (matches
      existing `router.replace` clear pattern), so a refresh doesn't re-open it.
- [ ] Params work correctly even when they arrive during/before the login
      redirect (survive the auth round-trip).

## Notes for AI

Decisions salvaged from a broken PM run on this task (2026-09-14) — worth
verifying, not necessarily final:
- Query param names: `?task=`, `?input=`, `?setting=` (with `new` as the
  reserved sentinel value for opening the "create new" panel).
- Settings already deep-links via `?focus=` — add/alias `?setting=` without
  dropping the existing `?focus=` behavior.
- No new routes appear to be needed; params should ride on the existing
  `/work` and `/settings` paths.
- Mirror whatever existing `status`/`focus` query-param parsing pattern
  already exists (retry-until-loaded, `router.replace` to clear) rather than
  inventing a new mechanism.

## Original prompt

Let's add some additional url params to this web app, like for a given task /work?task=0340 should open that task, and /work?task=new opens new task panel etc. (do the same for inputs and anywhere else you think it's appropriate and useful, e.g. could even have /settings?setting=abc which scroll to the relevant setting)

## Activity

- 2026-09-14T05:39:57Z · title, body
- 2026-09-14T06:53:00Z · title, body
- 2026-09-14T07:27:40Z · review_model_override
- 2026-09-14T07:27:41Z · status inbox→ready
