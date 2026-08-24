---
id: "0272"
title: "Task card error UX: full-width fix button, move full error detail to the task panel"
type: bug
status: active
priority: p2
area: ui
assigned_to: ai
created_by: ""
branch: feat/task-card-error-ux-full-width-fix-button
created_at: "2026-08-24T15:56:16Z"
updated_at: "2026-08-24T21:22:25Z"
---
## Problem

When a task hits MTD (move-to-done) and errors, the task card's error affordances are backwards relative to the surfaces they appear on:

- The small task card's "fix" button is not full width — it renders at content width, looking cramped and easy to miss.
- Clicking to expand an error on the card reveals the full error detail inline on the card, which bloats a surface meant to stay compact.
- The large task panel (drawer) — which has plenty of room — only shows a short snippet of the error, hiding the very detail a user needs when investigating a failure.

The hierarchy is inverted: the small card should stay compact (just signal + one obvious action), and the spacious task panel is where the full error detail belongs.

## Fix

- **Full-width fix button on the card.** Make the card's "fix" button stretch to the full width of its container so it is a prominent, unmissable primary action.
- **Expand opens the task panel, not the card.** Clicking to expand an error on the card should no longer expand inline. Instead, it should open the task panel (drawer) for that task and surface the full error detail there.
- **Full detail in the task panel.** The task panel's error display should render the complete error detail (stack trace, message, and any additional context), not a truncated snippet. Add scrolling as needed so the panel stays usable for long traces.

## Acceptance criteria

- [ ] Card fix button spans the full container width.
- [ ] Clicking an error on the card opens the task panel with the error focused; no inline expansion remains on the card.
- [ ] Task panel shows the entire error detail in full, with scrolling for long content.
- [ ] repoos check passes.

## Notes / considerations

- This is a UI-only change; no server/engine behavior changes expected.
- Check whether an identical fix flows to every error surface that reuses the card or panel components (e.g. close-out errors, preview start errors) so the pattern stays consistent.

## Activity

- 2026-08-24T15:59:08Z · body
- 2026-08-24T20:28:07Z · body
- 2026-08-24T20:30:17Z · status inbox→ready
- 2026-08-24T21:22:25Z · status ready→active, branch
