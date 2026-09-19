---
id: "0432"
title: Fix colors in authentication & users settings section
type: bug
status: inbox
priority: p1
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: ""
cli_override: kiro
created_at: "2026-09-19T00:54:12Z"
updated_at: "2026-09-19T00:56:11Z"
---
## Problem

The authentication & users section of settings has color and contrast issues across all themes in both light and dark modes. Text visibility is degraded due to poor contrast, and visual separators appear too prominent, creating an inconsistent appearance with the rest of the settings interface.

## Desired UX

The authentication & users settings section should:
- Display all text with sufficient contrast to be clearly readable in all themes and lighting modes
- Have appropriately weighted visual separators that blend naturally with the interface
- Maintain visual harmony with other settings sections
- Render cleanly across all available themes in both light and dark modes

## Acceptance criteria

- [ ] All text in the authentication & users section meets WCAG contrast requirements in all themes
- [ ] Visual lines/separators are appropriately weighted and not overly prominent
- [ ] Section appearance is consistent across all themes (light and dark modes)
- [ ] No regressions in other settings sections
- [ ] Verified in at least one light theme and one dark theme

## Notes for AI

- Screenshots showing the rendering issues are attached in task inputs
- Focus on the color palette, text color contrast, and line/border styling
- The issue spans multiple themes, suggesting it may be a theme variable or global styling problem rather than a single theme's issue
- Touch only the authentication & users section styling — do not make broader changes to settings styling unless necessary to fix this specific issue

## Scope

This task covers the authentication & users section only. Other settings sections are out of scope.

## Original prompt

Fix the colors on the authentication & users section of settings. It doesn't look right in light or dark mode on every theme. As you can see from the screenshots some of the text is barely visible and the lines are too strong.

## Screenshots

![Screenshot-2026-09-19-at-00.50.57](/api/tasks/0432/attachments/screenshot-1.png)
![Screenshot-2026-09-19-at-00.51.07](/api/tasks/0432/attachments/screenshot-2.png)

## Activity

- 2026-09-19T00:54:12Z · created · hello@repoos.org
- 2026-09-19T00:54:14Z · screenshots
- 2026-09-19T00:54:14Z · screenshots
- 2026-09-19T00:54:33Z · status draft→inbox, title, priority, area, type, body
- 2026-09-19T00:56:08Z · cli_override
- 2026-09-19T00:56:09Z · cli_override
- 2026-09-19T00:56:10Z · cli_override
- 2026-09-19T00:56:11Z · cli_override
