---
id: "0795"
title: "Easter eggs bundle: Hub find bar position, Done button, and Escape"
type: bug
status: ready
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-15T08:02:06Z"
updated_at: "2026-10-15T08:08:00Z"
---
## Problem
The Hub's new Cmd-F find bar (from #0789) has three issues on the native macOS app:
1. It sits at the bottom left of the window. It should be at the top right, like the find bars in other Mac apps.
2. It has a 'Replace' option. Find-only is enough, so remove Replace.
3. The 'Done' button does nothing, and there's no other way to close the bar.

## Desired UX
- The find bar opens in the top right corner of the window, over the content.
- Remove the Replace option.
- Close the bar with a button on the right side of the bar (an X, or Done that works), and with Escape.
- After closing, focus returns to the page.

## Acceptance criteria
- Find bar appears in the top right of the window in light and dark appearance.
- No Replace control.
- Done or the close button hides the bar and clears the highlights; Escape does the same.
- Test or manual check: Cmd-F, type, Escape closes, Cmd-F reopens with the field focused.

## Notes for AI
Start from the find bar view in macos/RepoOSHub/ServerWebView.swift and the Find menu items in macos/RepoOSHub/RepoOSHubApp.swift (Find, Find Next, Find Previous). Source: user report 2026-10-15 on the Hub's Cmd-F find bar (#0789).

## Activity

- 2026-10-15T08:02:06Z · created · njachowski@gmail.com
- 2026-10-15T08:08:00Z · status inbox→ready
