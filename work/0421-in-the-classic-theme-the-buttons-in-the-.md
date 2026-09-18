---
id: "0421"
title: Fix opacity issue in classic theme buttons
type: bug
status: review
priority: p1
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/fix-opacity-issue-in-classic-theme-butto
created_at: "2026-09-18T15:34:43Z"
updated_at: "2026-09-18T17:05:38Z"
handoff_signal_retry_count: 1
---
## Problem

Buttons in the top right of the classic theme have an opacity issue that degrades readability. Users struggle to read the button content, indicating insufficient contrast or visibility.

## Desired UX

Top-right buttons should have clear, readable content with sufficient contrast in all themes. The opacity should not interfere with legibility.

## Acceptance criteria

- [ ] Locate the opacity styling for top-right buttons in the classic theme
- [ ] Adjust opacity to make button content readable
- [ ] Verify the fix in the classic theme
- [ ] Check all other available themes for the same opacity issue
- [ ] Confirm all themes meet accessibility contrast standards for buttons
- [ ] Run UI smoke test to verify no regressions

## Notes for AI

- The issue is likely in theme CSS/styling files, probably under `src/ui-app/src/style.css` or theme-specific stylesheets
- "Top right buttons" likely refers to UI controls in the header/toolbar area
- Test in the running preview to visually confirm readability before marking done
- Ensure any theme fixes maintain the intended visual hierarchy and design language
- If multiple themes have the same issue, fix all of them as part of this task

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>

## Original prompt

In the classic theme the buttons in the top right have an opacity issue that makes it hard to read the content. Please fix it and check the other themes to see if they have the same issue.

## Screenshots

![Screenshot-2026-09-18-at-23.31.22](/api/tasks/0421/attachments/screenshot-1.png)
![Screenshot-2026-09-18-at-23.30.50](/api/tasks/0421/attachments/screenshot-2.png)

## Activity

- 2026-09-18T15:34:43Z · created · hello@repoos.org
- 2026-09-18T15:34:44Z · screenshots
- 2026-09-18T15:34:44Z · screenshots
- 2026-09-18T15:34:56Z · status draft→inbox, title, priority, area, type, body
- 2026-09-18T16:55:52Z · status inbox→ready
- 2026-09-18T16:55:57Z · status ready→active, branch
- 2026-09-18T17:05:38Z · status active→review
