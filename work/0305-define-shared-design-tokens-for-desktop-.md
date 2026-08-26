---
id: "0305"
title: Define shared design tokens for desktop and mobile
type: chore
status: review
priority: p1
area: ui
assigned_to: ai
created_by: ""
branch: feat/define-shared-design-tokens-for-desktop-
model_override: deepinfra/Qwen/Qwen3-Coder-480B-A35B-Instruct-Turbo
review_model_override: deepinfra/Qwen/Qwen3-Coder-480B-A35B-Instruct-Turbo
created_at: "2026-08-26T17:18:07Z"
updated_at: "2026-08-26T18:08:28Z"
review_passes: 1
---
## Problem

The desktop UI currently owns its visual language through a large global stylesheet, while the native mobile app needs its own shell and components. Starting mobile work without a clear shared token contract could create visual drift or force the mobile build to copy desktop implementation details.

## Desired outcome

Define a stable, documented design-token foundation that both the existing desktop Vue app and the native Ionic mobile app can consume. This task establishes the contract; it does not migrate every desktop component from CSS to Tailwind.

## Acceptance criteria

- [ ] Inventory and formalize shared tokens for colors, typography, spacing, radii, borders, shadows, motion, safe areas, and semantic states.
- [ ] Preserve the existing theme variants, including dark/light and current named themes, without changing their visual output unexpectedly.
- [ ] Define a clear token consumption path for the desktop Vue app and the separate mobile app.
- [ ] Add mobile-safe-area and touch-target guidance to the token/documentation layer.
- [ ] Map the token foundation to Tailwind where useful, while retaining CSS custom properties for runtime theme switching and Ionic/mobile consumption.
- [ ] Document naming conventions and examples for new shared components.
- [ ] Add focused tests or build verification proving the desktop and mobile builds can consume the shared token foundation.
- [ ] Do not convert all existing components, remove the global stylesheet, or redesign desktop screens in this task.

## Notes

This is a prerequisite for the mobile shell tasks #0302/#0303/#0304 and should coordinate with the broader CSS-to-Tailwind migration task #0202. Follow docs/mobile-ux-strategy.md.

## Activity

- 2026-08-26T17:18:07Z · created · unknown
- 2026-08-26T17:22:58Z · model_override
- 2026-08-26T17:23:13Z · review_model_override
- 2026-08-26T17:23:20Z · status inbox→ready
- 2026-08-26T17:23:23Z · status ready→active, branch
- 2026-08-26T17:30:14Z · status active→review
- 2026-08-26T17:35:49Z · status review→active
- 2026-08-26T17:39:09Z · status active→review
- 2026-08-26T17:46:24Z · needs_input
- 2026-08-26T18:08:00Z · review_model_override
- 2026-08-26T18:08:28Z · needs_input
