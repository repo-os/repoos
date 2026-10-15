---
id: "0789"
title: "Hub: Find bar on Cmd-F is black and can't be typed into"
type: bug
status: done
priority: p2
area: web
merged_commit: b3e260927fd06467c95f543caf89007b5447ad84
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/hub-find-bar-on-cmd-f-is-black-and-can-t
model_override: opencode/muse-spark-1.3-contributor-free
created_at: "2026-10-15T06:31:02Z"
updated_at: "2026-10-15T07:39:56Z"
last_close_out_gate_ms: 85724
last_close_out_gate_at: "2026-10-15T07:39:39.587Z"
review_passes: 1
dev_error_count: 1
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
- 2026-10-15T06:42:30Z · agent exited with an error (opencode) · network problem reaching the model provider, not a code issue: ConnectionRefused: Unable to connect. Is the computer able to access the url?
- 2026-10-15T07:16:54Z · body
- 2026-10-15T07:24:44Z · status active→review
- 2026-10-15T07:24:45Z · note: shots: skipped — the diff (7 changed paths) touches no capture target's globs — no UI change to capture
- 2026-10-15T07:25:27Z · note: review pass 1: good to go
- 2026-10-15T07:39:39Z · close-out gate completed in 86s
- 2026-10-15T07:39:56Z · status review→done, release:success
