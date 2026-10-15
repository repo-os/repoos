---
id: "0789"
title: "Hub: Find bar on Cmd-F is black and can't be typed into"
type: bug
status: ready
priority: p2
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/hub-find-bar-on-cmd-f-is-black-and-can-t
model_override: opencode/muse-spark-1.3-contributor-free
created_at: "2026-10-15T06:31:02Z"
updated_at: "2026-10-15T08:29:34Z"
---
## Problem
In the native macOS RepoOS Hub, Cmd-F now shows a black strip at the top of the window (from the #0783 Find work). Its text field can't be typed into, and no controls are readable, so the user can't search the page. Reported 2026-10-15.

The app's own search overlay ('Search settings by name or config key', from SearchOverlay.vue) also appeared in one screenshot. The web UI does not bind Cmd-F itself, so it isn't clear what opened that overlay. It needs to be traced before the fix.

## Desired UX
- Cmd-F opens a visible, typeable find bar for the current page only, in light and dark appearance, with the match count, next and previous, and a close control.
- Esc closes it. Cmd-G and Shift-Cmd-G step through matches.
- Cmd-K stays the app-wide search. Cmd-F does NOT open the app's settings or task search, since the browser convention is in-page find.

## Acceptance criteria
- Typing in the Find bar filters the page and highlights matches; the match count updates.
- The bar's text field takes focus when it opens.
- The bar is readable in light and dark appearance.
- Trace and record what opened the settings-search overlay in the screenshot, and fix it if it was a Cmd-F path (for example, a shared key handler on the Hub side).

## Notes for AI
Start from the Find command in macos/RepoOSHub/RepoOSHubApp.swift (Edit menu, Cmd-F) and workspacePresentFind in macos/RepoOSHub/HubAppState.swift, plus the find bar view in macos/RepoOSHub/ServerWebView.swift. The Find work is #0783 (done). Source: user report 2026-10-15.

## Activity

- 2026-10-15T06:31:02Z · created · njachowski@gmail.com
- 2026-10-15T06:33:38Z · model_override
- 2026-10-15T06:33:38Z · status inbox→ready
- 2026-10-15T06:33:40Z · status ready→active, branch
- 2026-10-15T08:29:34Z · watchdog: auto-surfaced stuck task · status active→ready · agent never started — no session exists for this task · next step: resume the session manually from the task's worktree and check for uncommitted work
