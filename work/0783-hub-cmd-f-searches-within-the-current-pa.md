---
id: "0783"
title: "Hub: Cmd-F searches within the current page"
type: feature
status: ready
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-14T11:42:22Z"
updated_at: "2026-10-14T11:45:47Z"
---
## Problem
In the native macOS RepoOS Hub, Cmd-F does nothing. The app defines no Find command, so the key is ignored, and the web pages in the Hub have no find bar. Cmd-K opens the Quick Switcher, which is for jumping between servers and tasks, not for searching text on the page.

## Desired UX
- Cmd-F in the Hub opens find-in-page for the server page being shown, with next and previous matches and a close control.
- Cmd-G and Shift-Cmd-G step through matches. Cmd-K stays the Quick Switcher.
- If no web page is in focus (for example the native sidebar is active), Cmd-F does nothing rather than searching a different page.
- The browser and PWA versions of the RepoOS UI are NOT changed. In a browser, Cmd-F already opens the browser's own find bar, and the app must not override it. The Hub fix only adds find where the native app has no find UI at all.

## Acceptance criteria
- Edit > Find menu item with Cmd-F, and Find Next and Find Previous with Cmd-G and Shift-Cmd-G.
- Find runs in the active server's web view, and the match count is visible.
- Works on Releases, Dev and Task pages; checked in light and dark appearance.
- The browser and PWA UI has no keyboard handler added for Cmd-F (a test or review check confirms no preventDefault on Cmd-F in src/ui-app).

## Notes for AI
Start from macos/RepoOSHub/RepoOSHubApp.swift (the existing CommandMenu('Go') with Quick Switcher on Cmd-K) and the web view in macos/RepoOSHub/ServerWebView.swift. WKWebView supports in-page find on macOS 13 and later; check the deployment target first. Source: user request 2026-10-14.

## Activity

- 2026-10-14T11:42:22Z · created · njachowski@gmail.com
- 2026-10-14T11:43:06Z · body
- 2026-10-14T11:45:40Z · cli_override, model_override
- 2026-10-14T11:45:47Z · status inbox→ready
