---
id: "0144"
title: Replace the chat help button with a simple RepoOS-icon bubble
type: feature
status: done
priority: p2
area: general
assigned_to: ai
created_by: ""
branch: feat/replace-the-chat-help-button-with-a-simp
created_at: "2026-08-12T13:08:52Z"
updated_at: "2026-08-12T13:31:53Z"
---
```markdown
---
title: Replace the chat help button with a simple RepoOS-icon bubble
type: feature
priority: p2
area: web
assigned_to: ai
---

## Problem

The chat help button in the lower-right corner is a pill-shaped launcher with a generic speech-bubble SVG icon and the text label "Ask RepoOS Guide." It is visually heavy and clashes with the app's clean aesthetic. A simpler, icon-only bubble using the RepoOS brand mark would be more cohesive and less visually cluttered.

## Desired UX

A circular chat bubble sits in the lower-right corner (same fixed position: `right: 22px`, `bottom: 22px`). It shows only the RepoOS brand diamond icon — the same mark used in the TopBar and favicon (a hexagon/diamond with three vertical interior lines, cyan stroke). The button has the same cyan-gradient glass styling as the current launcher. The busy dot remains and pulses when the guide is running. On click, the chat panel opens exactly as it does today. No text label. Clean and simple.

## Acceptance criteria

- [ ] The launcher button renders as a circle containing only the RepoOS diamond icon (matching the TopBar mark: a hexagon path + three vertical line paths, cyan + violet strokes).
- [ ] The text label "Ask RepoOS Guide" is removed.
- [ ] The button dimensions are appropriate for an icon-only circle (e.g. 50–52px) on desktop, with matching mobile size.
- [ ] The running dot (busy indicator) is preserved and positioned correctly on the new bubble shape.
- [ ] The cyan gradient background, hover lift, focus ring, and position are unchanged from the current launcher.
- [ ] Clicking the bubble still toggles the chat panel open/closed.
- [ ] `repoos check` passes.

## Notes for AI

- **File**: `src/ui-app/src/components/RepoGuideChat.vue`, lines 187–193 (template) and 201–205 (CSS).
- **Icon source**: copy the inline SVG from TopBar (`src/ui-app/src/components/TopBar.vue`, the two paths — the hexagon outline and the three vertical lines). The TopBar wraps it in a CSS-styled container; you only need the SVG paths. Do NOT include the TopBar's outer `<div class="logo-mark">` or its `::after` pseudo-element — keep the existing launcher background styles.
- **Dimensions**: make the button a `52px` square circle on desktop (same height as current pill, just square). On mobile (the `max-width: 760px` media query), it already collapses to `50px` square — keep that size but confirm the icon sizing still works.
- **Busy dot**: currently a `7px` green dot with pulse animation. Position it relative to the new circular button (top-right corner of the circle, or centered-bottom — pick whatever looks cleanest; suggest top-right mimicking notification-badge convention).
- **Do not** change the chat panel, the toggle behavior, the hydration logic, or anything in the script block.
- **Do not** add new CSS variables or change the glassmorphism style.
- **Assumption**: by "chat bubble with the repoos icon" the user means the RepoOS brand diamond/hexagon mark (same as favicon and TopBar), not the current speech-bubble icon.

## Scope

- **In scope**: replacing the launcher button's icon and removing its text label.
- **Deferred**: any changes to the chat panel, the minimize button icon, agent identity, or the overall chat UX.
```

## Activity

- 2026-08-12T13:08:52Z · created · unknown
- 2026-08-12T13:09:27Z · title, branch
- 2026-08-12T13:09:29Z · status inbox→ready
- 2026-08-12T13:14:17Z · status ready→review
- 2026-08-12T13:31:53Z · status review→done, release:success
