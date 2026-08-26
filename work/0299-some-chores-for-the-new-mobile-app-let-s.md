---
id: "0299"
title: Update Mobile App Icons and Improve UX
type: chore
status: inbox
priority: p2
area: ui
assigned_to: ai
created_by: hello@repoos.org
branch: ""
model_override: deepinfra/deepseek-ai/DeepSeek-V4-Pro-0813
review_model_override: deepinfra/Qwen/Qwen3-Coder-480B-A35B-Instruct-Turbo
created_at: "2026-08-26T14:22:34Z"
updated_at: "2026-08-26T14:23:18Z"
---
## Problem

The mobile app currently uses default Ionic icons instead of the actual RepoOS logo. This includes both the app icon and in-app logo display. Additionally, several icons (settings, edit, close, up/down) are too small for mobile use. The 'x' button to delete servers appears on the main page, which is not ideal - it should only be accessible when editing a server after successful setup.

## Desired UX

- Mobile app should display the official RepoOS logo as both app icon and in-app branding
- All interactive icons should be appropriately sized for mobile touch targets
- Delete server functionality ('x' button) should only appear on the edit server page, not the main server list

## Acceptance criteria

- [ ] Replace default Ionic app icon with actual RepoOS logo
- [ ] Update in-app logo to use correct RepoOS branding
- [ ] Increase size of settings, edit, close, and up/down icons to be mobile-friendly
- [ ] Move delete server button from main page to edit server page only
- [ ] Verify all icon changes are consistent across different mobile screen sizes
- [ ] Test that delete functionality still works correctly on edit server page

## Notes for AI

- Focus on mobile-specific UI files and icon assets
- Look for existing icon components and styling patterns to maintain consistency
- Assume standard mobile touch target sizes (minimum 48x48dp) for icon sizing
- Check both iOS and Android platforms if applicable

## Scope

Covers mobile app iconography and UI placement changes. Does not include desktop app modifications or new feature development.

## Original prompt

Some chores for the new mobile app: Let's use the actual RepoOS logo in the mobile app (currently the app icon is the default ionic app icon and inside the app the logo is not correct either). Also the settings icon and and edit and close and up/down icons are all too small and not mobile friendly. And actually the x button (to delete the server) shouldn't be on the main page at all, it should only show on the edit server page (after the server has been setup and connected to successfully).

## Activity

- 2026-08-26T14:22:59Z · status draft→inbox, title, area, type, body
- 2026-08-26T14:23:12Z · model_override
- 2026-08-26T14:23:18Z · review_model_override
