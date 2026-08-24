---
id: "0281"
title: Replace spec inline textarea with a dedicated edit modal
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/replace-spec-inline-textarea-with-a-dedi
model_override: default
created_at: "2026-08-24T17:08:16Z"
updated_at: "2026-08-24T23:38:24Z"
handoff_signal_retry_count: 1
---
## Problem

The spec text area is buggy. Currently, clicking on the pretty markdown view swaps it in place to a text area for editing. This in-place swap is unreliable and provides a poor UX. Users need a cleaner, more predictable way to edit spec markdown.

## Desired UX

The original pretty markdown view should be left unchanged — clicking on it must not replace it with a text area in place. Instead, opening the spec for editing should present a dedicated spec edit modal as an overlay on top of the current view.

When the user edits the spec markdown inside that modal and clicks Save, the original pretty markdown view should be updated automatically to reflect the new edits.

## Acceptance criteria

- [ ] Clicking on the spec pretty markdown view no longer replaces it with an in-place text area
- [ ] Opening the spec for editing shows a spec edit modal as a separate overlay, leaving the pretty markdown view intact beneath it
- [ ] The modal contains a text area (or editor) prefilled with the current spec markdown
- [ ] Clicking Save in the modal updates the original pretty markdown view automatically with the edited markdown
- [ ] The modal can be dismissed (close/cancel) without applying changes
- [ ] Existing spec-viewing behaviors are preserved when the modal is not open

## Notes for AI

- This is a UI-only change in the web app (`src/ui-app`).
- Locate the current spec view and its in-place text area swap logic in the relevant SFC under `src/ui-app`.
- Replace the in-place swap with a modal component rendered as an overlay; keep the pretty markdown component untouched when the modal is open.
- On Save, propagate the edited markdown back to the source that renders the pretty view so it re-renders with the new content.
- After the change, rebuild the UI (`bun run build:ui` or `bun run build`) and verify with a browser probe before reporting done.
- Assumption: the modal editing surface reads/writes the same markdown string that feeds the pretty view; a cancel action discards any in-progress edits. No changes to the underlying spec data model or API are implied.

## Related

- `docs/` for UI build and verification conventions; `src/ui-app` for the component source.

## Original prompt

The spec text area is buggy, rather than changing the original pretty markdown view to a text area when it's clicked on, let's leave it as is and open a spec edit modal separately  as an overlay, this will be a better ux. and when the user finishes editing the spec markdown in that modal and click save the original pretty markdown should be updated automatically with those edits.

## Activity

- 2026-08-24T17:08:37Z · status draft→inbox, title, area, body
- 2026-08-24T20:27:53Z · status inbox→ready
- 2026-08-24T20:58:27Z · status ready→active, branch
- 2026-08-24T21:10:15Z · status active→review
- 2026-08-24T21:31:20Z · model_override
- 2026-08-24T23:38:24Z · watchdog: auto-retried dead reviewer session · the reviewer agent produced no report and its session ended — starting a fresh review
