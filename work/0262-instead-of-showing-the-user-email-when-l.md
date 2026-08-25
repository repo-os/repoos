---
id: "0262"
title: "User avatar popover: replace email display with icon + dropdown menu"
type: feature
status: done
priority: p2
area: general
assigned_to: ai
created_by: ""
branch: feat/user-avatar-popover-replace-email-displa
model_override: default
pm_model_override: default
created_at: "2026-08-19T19:06:38Z"
updated_at: "2026-08-20T12:24:46Z"
---
## Goal

Replace the always-visible email text + inline logout button in the top-right corner with a compact user-avatar icon. Clicking or hovering the icon reveals a dropdown/popover showing the user's email and a "Log out" button.

## Current state

- `TopBar.vue` (lines 174-179) renders a `.user-chip` div containing:
  - `<span class="user-chip-email">` with the user's email (hidden on mobile via `hidden sm:inline`)
  - A small `<LogOut>` icon button that calls `auth.logout()`
- Auth state comes from `stores/auth.ts` (`useAuthStore`), which exposes `email`, `authenticated`, and `logout()`.
- Icons are from `lucide-vue-next`. The existing codebase already imports `LogOut`, `Moon`, `Sun`, `RefreshCw`, `RotateCcc` in TopBar.
- The TopBar already has a hand-rolled popover pattern for the theme color picker (manual `v-if` toggle + outside-click handler).

## Requirements

### UI
1. **Trigger element**: Replace the `.user-chip` with a clickable avatar/icon button. Use the `User` icon from `lucide-vue-next` (or a similar generic person icon). The button should be visually consistent with the other TopBar icon buttons (theme toggle, refresh, etc.).
2. **Dropdown/popover**: On click (not hover), toggle a small dropdown positioned below the trigger, aligned to the right edge.
3. **Dropdown content**:
   - The user's email displayed as plain text (mono font, truncated with ellipsis if long — keep existing `max-width: 180px` behaviour).
   - A "Log out" button (styled as a danger/red-tinted button) that calls `auth.logout()`.
4. **Dismiss behaviour**: Clicking outside the dropdown closes it. Pressing Escape closes it. Clicking the trigger again toggles it closed.
5. **Mobile**: The icon should always be visible (remove the `hidden sm:inline` that currently hides the email on small screens — the icon itself should always show).
6. **Accessibility**: The trigger button needs `aria-label="User menu"` and `aria-expanded` bound to the open state. The dropdown should trap focus and be keyboard-navigable.

### Technical
- Follow the existing popover pattern already used for the theme color picker in TopBar (manual toggle ref + outside-click `mousedown` listener), unless a Radix Vue `Popover` primitive is warranted. Either approach is fine — pick whichever is simpler and consistent with the rest of the TopBar.
- Use existing design tokens (`--popover`, `--border`, `--txt`, `--red-tint`, etc.) for styling the dropdown. Do not hardcode colours.
- Use the existing `LogOut` icon from `lucide-vue-next` inside the dropdown for the logout button.
- Keep the `auth.logout()` call unchanged.
- No new runtime dependencies.

## Out of scope
- Changing the auth flow or session management.
- Adding user profile pages or account settings.
- Radix Popover wrapper component creation (only needed if you choose that approach; the hand-rolled pattern is fine).

## Verification
- After implementation, run `bun run build:ui` and verify the TopBar renders correctly.
- Confirm: avatar icon visible at all viewport widths; dropdown opens/closes on click; email is shown in dropdown; logout button works; clicking outside closes the dropdown; Escape closes the dropdown.

## Activity

- 2026-08-20T03:25:16Z · body
- 2026-08-20T04:07:43Z · status draft→inbox
- 2026-08-20T05:21:09Z · status inbox→ready
- 2026-08-20T09:27:57Z · status ready→active, branch
- 2026-08-20T09:31:40Z · status active→review
- 2026-08-20T12:24:46Z · status review→done, release:success
