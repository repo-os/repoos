---
id: "0292"
title: Add optional glide animations when cards change state
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/add-optional-glide-animations-when-cards
created_at: "2026-08-24T22:02:35Z"
updated_at: "2026-08-24T22:47:13Z"
---
## Problem

When a card's state changes (for example moving between columns on a kanban
board), the transition is abrupt and gives no visual feedback about where the
card came from or where it went. This makes state changes harder to follow and
feels less polished than modern task/project tools. Users have described the
current behavior as lacking the "magic" of seeing cards glide between columns.

## Desired UX

- When a card changes state (e.g. moves from one column to another), it
  animates smoothly, gliding between its old position and its new position
  rather than appearing instantly in place.
- The animation should feel fluid and magical (akin to a FLIP-style or layout
  animation), making it clear where the card traveled from and to.
- This behavior is off by default. It is controlled by a toggle in the
  settings UI that the user can turn on or off at any time.
- When disabled, cards change state exactly as they do today (instantly, no
  animation).

## Acceptance criteria

- [ ] Cards animate (glide) between columns on state change when the setting is enabled.
- [ ] The animation clearly conveys the source and destination of the moving card.
- [ ] A settings option exists that toggles this animation on and off.
- [ ] The setting is off by default.
- [ ] When the setting is off, card state changes behave exactly as today (no animation).
- [ ] Toggling the setting takes effect without requiring a page reload.
- [ ] `repoos check` passes (build, typecheck, tests, UI smoke test).

## Notes for AI

- This is a UI (web) change only; there is no core engine or data-model impact.
- Settings live in the UI-app settings area — follow the existing settings
  pattern for adding a new toggle (persistence, default value, and reading the
  value where cards render).
- Implement the animation client-side (e.g. FLIP / layout animation) so column
  position changes animate; avoid rebuilding the existing state-change flow.
- Assume the animation should also respect the user's "reduce motion" system
  preference as a reasonable default, but this is not a hard requirement.
- After any UI change, rebuild (`bun run build:ui` or `bun run build`) so the
  worktree build stays fresh, and re-run `repoos check`.
- Do not add a runtime dependency — zero runtime dependencies is a hard
  constraint; use what the existing UI stack already provides.

## Scope

- Covers: the settings toggle and the glide animation on card state changes.
- Deferred: animations for other UI elements (board reorder, card content
  changes, drag-and-drop interactions) unless they fall out naturally from the
  same mechanism.

## Related

- None.
---

## Original prompt

could we get better animations of when cards change state? like show them gliding between columns a bit like magic? make it an option in ssettings that you can toggle on/off

## Activity

- 2026-08-24T22:02:59Z · status draft→inbox, title, area, body
- 2026-08-24T22:04:57Z · status inbox→ready
- 2026-08-24T22:05:05Z · status ready→active, branch
- 2026-08-24T22:47:13Z · status active→review
