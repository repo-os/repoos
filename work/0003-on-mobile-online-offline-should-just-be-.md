---
id: "0003"
title: On mobile online/offline should just be a colored dot
type: chore
status: review
priority: p3
area: mobile
assigned_to: ai
created_by: ""
branch: feat/on-mobile-online-offline-should-just-be-
created_at: "2026-05-29T00:00:00Z"
updated_at: "2026-08-13T11:30:26Z"
---
## Problem

The top bar renders a full `live` / `offline` connection pill at every viewport
size. On narrow mobile screens that label consumes scarce horizontal space and
competes with the repository name and search control even though the connection
state can be communicated by the existing colored dot.

## Desired UX

Desktop and tablet layouts retain the readable connection pill. At the mobile
breakpoint it becomes a compact green/red dot with an accessible label and
tooltip, preserving the same live pulse and connection semantics without the
text or pill padding.

## Acceptance criteria

- [ ] At the existing mobile breakpoint, the connection indicator renders as a
      compact colored dot without visible `live` / `offline` text.
- [ ] The mobile indicator exposes the full state through `aria-label` and
      `title`; color is not the only information available to assistive tools.
- [ ] Desktop/tablet appearance and SSE connection behavior are unchanged.
- [ ] Both connected and disconnected mobile states are visually verified.
- [ ] `repoos check` passes.

## Notes for AI

- The current indicator is in `src/ui-app/src/components/TopBar.vue`; `.conn`
  and `.conn .dot` live in `src/ui-app/src/style.css`.
- Reuse the existing responsive breakpoint and status colors/animation. Do not
  add JavaScript viewport detection or a second connection-state component.
- Respect reduced-motion preferences when retaining the connected pulse.

## Activity

- 2026-05-29T00:00:00Z · created · (migrated)
- 2026-08-11T15:37:46Z · updated · replace migrated placeholders with actionable mobile scope
- 2026-08-13T04:48:43Z · status inbox→ready
- 2026-08-13T11:30:26Z · branch
