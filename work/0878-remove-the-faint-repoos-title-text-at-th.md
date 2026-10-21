---
id: "0878"
title: "Remove the faint \"RepoOS\" title text at the top left of the app window (old Hub topbar leftover)"
type: bug
status: active
priority: p3
area: [web, macos]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/remove-the-faint-repoos-title-text-at-th
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-10-20T14:00:36Z"
updated_at: "2026-10-21T03:41:15Z"
---
## Problem
A faint "RepoOS" label shows at the top left of the window, overlapping the macOS traffic-light buttons and sitting next to the real RepoOS logo and wordmark. It appears in two states: with the sidebar collapsed (partly behind the green button, above the wordmark) and in the normal layout (just right of the traffic lights). It looks like a leftover from the old native RepoOS Hub topbar, and it duplicates the wordmark.

## Desired UX
No faint duplicate "RepoOS" text anywhere in the title bar or top left area, in RepoOS Hub or in the browser or PWA. The logo and wordmark remain. The traffic-light area stays free for dragging the window.

## Acceptance criteria
- Find where the faint text comes from (native window title or titlebar view in RepoOS Hub, or an element in the web UI) and remove it.
- It is gone in both the collapsed-sidebar and normal layouts.
- The window can still be dragged by the top area, and the traffic lights are unobstructed.
- Window titles used for accessibility, Mission Control or the app switcher are not lost if the fix hides the visible title (hide the title visually only, e.g. a hidden-title window style).
- Check the browser and PWA for the same text and fix it there too if it appears.

## Notes for AI
- Likely the macOS Hub window title being drawn in a transparent or full-size titlebar (`titleVisibility` or `.hiddenTitleBar` or similar in `macos/RepoOSHub`), shown through the web content. Search `macos/RepoOSHub` for the title setup first, then the web header component.
- The reporter's two screenshots could not be attached automatically; ask the human for the files if a visual is needed.

## Activity

- 2026-10-20T14:00:36Z · created · njachowski@gmail.com
- 2026-10-21T03:12:34Z · status inbox→ready
- 2026-10-21T03:12:42Z · cli_override, model_override
- 2026-10-21T03:12:44Z · status ready→active, branch
- 2026-10-21T03:29:51Z · message_queued at 2026-10-21T03:29:51.134Z
- 2026-10-21T03:29:51Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-21T03:38:16Z · body
- 2026-10-21T03:41:15Z · body
