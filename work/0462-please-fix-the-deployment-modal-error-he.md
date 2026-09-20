---
id: "0462"
title: Cap deployment modal error height so it can't overflow the page
type: bug
status: done
priority: p2
area: ui
assigned_to: ai
created_by: hello@repoos.org
branch: feat/cap-deployment-modal-error-height-so-it-
created_at: "2026-09-20T03:45:32Z"
updated_at: "2026-09-20T07:25:20Z"
---
## Problem
When a deploy fails, the error message is rendered in a `.dep-modal-error` block inside the deploy-confirmation modal (`DeploymentsView.vue`). The modal card (`.dep-card` in `src/ui-app/src/style.css:2519`) has no `max-height` and no internal scroll, and `.dep-modal-error` (`src/ui-app/src/style.css:2594`) only sets `white-space: pre-wrap` with no height cap. Long error output (multi-line git/push failures) makes the card grow taller than the viewport, overflowing the page and pushing the action buttons (Deploy / Cancel) out of reach — the user can't dismiss or retry the dialog.

## Desired UX
The deploy-confirmation modal should stay fully contained within the viewport regardless of how long the error text is. The error block (and/or the modal body) should scroll internally so the modal header and the Deploy/Cancel actions always remain visible and clickable.

## Acceptance criteria
- [ ] A long deploy error message no longer causes the modal to exceed the viewport height.
- [ ] The modal body (or the error block) scrolls internally instead of expanding the page.
- [ ] The modal header and the Deploy/Cancel action buttons remain visible and usable when an error is shown.
- [ ] Short, single-line errors continue to render normally with no spurious scrollbar.

## Notes for AI
- Files to touch:
  - `src/ui-app/src/style.css` — `.dep-card` (line 2519) likely needs a `max-height` (e.g. `max-height: 90vh`) plus `overflow-y: auto`; `.dep-modal-error` (line 2594) may also need a `max-height`/scroll cap so a very long error scrolls within the body.
  - `src/ui-app/src/views/DeploymentsView.vue` — confirm no inline style blocks height; the error binding is on line 469.
- The modal is wrapped in `<Teleport to="body">`, so CSS lives in `style.css`, not a `<style scoped>` block.
- Assumption: root cause is the missing height cap on `.dep-card`; fix at the container level rather than only clamping the error text, so the warning/command list also stay bounded.
- Do NOT change the error's `white-space: pre-wrap` (preserves formatting) or remove the `role="alert"`.
- After the change, rebuild (`bun run build:ui` or `bun run build`) so the worktree build is fresh.

## Scope
Covers the deploy-confirmation modal error overflow only. Does not cover other modal dialogs or the separate inline `.dep-outcome--fail` block on the page (a different element, line 405).

## Related
None specified.

## Original prompt

Please fix the deployment modal error height so that it doesn't overflow the page

## Screenshots

![Screenshot-2026-09-20-at-10.51.32](/api/tasks/0462/attachments/screenshot-1.png)

## Activity

- 2026-09-20T03:45:32Z · created · hello@repoos.org
- 2026-09-20T03:45:32Z · screenshots
- 2026-09-20T03:46:21Z · status draft→inbox, title, area, type, body
- 2026-09-20T03:47:14Z · status inbox→ready
- 2026-09-20T03:47:22Z · status ready→active, branch
- 2026-09-20T03:48:20Z · status active→review
- 2026-09-20T07:25:20Z · status review→done, release:success
