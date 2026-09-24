---
id: "0496"
title: Standardize New input panel styling with New task/New story panels
type: bug
status: review
needs_input: true
needs_input_reason: review-failed
needs_input_detail: the opencode agent timed out after 900s
priority: p2
area: web
story: Story numbers and deep links
assigned_to: ai
created_by: hello@repoos.org
branch: feat/standardize-new-input-panel-styling-with
review_model_override: opencode-go/mimo-v2.6-flash
created_at: "2026-09-23T05:40:57Z"
updated_at: "2026-09-24T16:14:12Z"
review_passes: 1
dev_error_count: 2
---
## Problem

The **New input** panel (`src/ui-app/src/components/NewInputPanel.vue`) does not follow the same colors/design as the other creation panels — **New task** (freeform dialog in `src/ui-app/src/components/TaskDrawer.vue`) and **New story** (`src/ui-app/src/components/NewStoryPanel.vue`). Those two share a common visual language built on the `ff-*` classes (`ff-textarea`, `ff-done`, `ff-done-head`, `ff-done-copy`, `ff-notice`, `ff-error`, plus shared `field`/`btn-row`) defined in `src/ui-app/src/style.css`. New input partially reuses those (`field`, `btn-row`, the `ff-done` acknowledgment screen) but styles its textarea, attachment button and pending-attachments list with bespoke scoped CSS (`.input-textarea`, `.attachment-btn`, `.input-attachments`, `.pending-attachment`), so its background colors, borders, radii and spacing drift from the sibling panels.

The inconsistency is visible to users and will keep recurring: nothing tells agents adding the *next* panel to reuse the shared styles.

## Desired UX

Opening **New input** looks and feels exactly like opening **New story** or the freeform **New task** panel: same drawer chrome, same field styling, same textarea colors/background/border/focus states, same attachment affordance look, same button row — identical in light and dark themes. A user moving between the three panels can't tell they were built at different times.

## Acceptance criteria

- [ ] The New input panel's form controls (textarea, "Add screenshot or file" attachment row, pending-attachments list) visually match the New task and New story panels — same background, border, border-radius, focus ring, spacing and typography — in both light and dark themes.
- [ ] Bespoke scoped styles in `NewInputPanel.vue` are replaced with (or converge on) the shared classes the other panels use (e.g. `ff-textarea` from `src/ui-app/src/style.css`); no duplicated color/spacing token values.
- [ ] Purely visual change: behavior is untouched — the submit → "Creating your input" acknowledgment flow (#0325), attachments, and the `?input=new` deep link all keep working, and existing tests keep passing.
- [ ] A convention is written down for future agents — in `AGENTS.md` (Conventions section) — that new drawer/panel forms must reuse the shared dialog components and `ff-*` form classes from `style.css` instead of bespoke scoped styles.
- [ ] `repoos check` passes, including the UI smoke test; run `bun run build:ui` (or full build) so the worktree build is fresh.

## Notes for AI

- Files to touch: `src/ui-app/src/components/NewInputPanel.vue` (replace scoped styles), `src/ui-app/src/style.css` (shared `ff-*` classes — extend them here if a needed variant is missing), `AGENTS.md` (convention note only).
- The reference panels to match are `NewStoryPanel.vue` and the freeform New task dialog in `TaskDrawer.vue` — treat their look as the source of truth, not the current New input look.
- Per repo convention, dialog/modal CSS lives in `src/ui-app/src/style.css`, not the view/component's `<style scoped>` block — dialogs are body-teleported.
- Do NOT change element IDs or behavior relied on by tests: `new-input-text`, `new-input-file`, and the suites `src/ui-app/tests/input-submit-ack.test.ts`, `input-numbering.test.ts`, `deep-link-params.test.ts`.
- Do NOT add New story–specific features (voice dictate, agent/model picker) to New input — this task is styling alignment only.
- Assumption: "same colors/design" means adopting the shared `ff-*` visual language; if New input needs a slightly different control (e.g. its file-attachment button has no equivalent in the other panels), style it from the same design tokens rather than inventing new colors.
- After any UI change, rebuild so `dist/` is fresh; do not request a preview to verify — that's the human's call.

## Scope

In scope: visual alignment of the New input panel with the other creation panels, and the documented styling convention for future panels.
Out of scope: redesigning or touching the other panels themselves, new functionality in any panel, theme/token system changes.

## Related

- #0325 (New input submit → acknowledgment flow) — introduced the current New input panel structure
- #0311 (freeform new-task flow) — the `ff-done` acknowledgment pattern New input mirrors

## Original prompt

The "new input" panel doesn't follow the same colors/design as the new task and new stories panels, can you standardise the styling so new input looks the same as the others and make sure future agents know to use consistent styling if we add a new panel etc.

## Screenshots

![Screenshot-2026-09-23-at-11.44.25](/api/tasks/0496/attachments/screenshot-1.png)
![Screenshot-2026-09-23-at-11.48.18](/api/tasks/0496/attachments/screenshot-2.png)

## Activity

- 2026-09-23T05:40:57Z · created · hello@repoos.org
- 2026-09-23T05:40:57Z · screenshots
- 2026-09-23T05:40:58Z · screenshots
- 2026-09-23T05:41:38Z · status draft→inbox, title, area, type, body
- 2026-09-23T06:31:19Z · status inbox→ready
- 2026-09-24T12:30:31Z · review_model_override
- 2026-09-24T12:30:33Z · status ready→active, branch
- 2026-09-24T12:53:58Z · agent exited with an error (cursor) · RetriableError: [unknown] Premature close
- 2026-09-24T12:59:02Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-09-24T13:49:36Z · status active→review
- 2026-09-24T15:47:27Z · story
- 2026-09-24T15:52:34Z · status review→active
- 2026-09-24T15:52:34Z · needs_input
- 2026-09-24T15:54:17Z · status active→review
- 2026-09-24T16:14:12Z · needs_input
