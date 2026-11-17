---
id: "1167"
title: "QA pass: use the macOS Hub app after the #1155 fix, find broken things and fix them"
type: bug
status: inbox
priority: p1
area: macos
assigned_to: ai
created_by: t@t
branch: ""
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-17T18:23:18Z"
updated_at: "2026-11-17T18:23:23Z"
---
## Problem

The macOS Hub was unusable for weeks and #1155 fixed the sidebar colors, but nobody has used the whole app after the fix. Nick wants it actually used.

## Desired UX

The Mac app launches, the sidebar shows every saved server with name and URL in both dark and light system appearance, servers show the right Reachable or Offline state, adding a server by URL works, opening a server shows the RepoOS UI, and relaunching keeps the saved servers.

## Acceptance criteria

- [ ] Build the current main with xcodebuild (CODE_SIGNING_ALLOWED=NO, own derivedDataPath), launch it, and capture ONLY the app window (screencapture -l<windowid>, never the whole screen: the desktop has private content). Look at every screenshot yourself.
- [ ] Exercise: sidebar in system dark and light, server rows, add server by URL (use a local test server on a spare port, never Nick's real servers), edit/remove, Settings, Cmd-K switcher, quit and relaunch.
- [ ] Record every defect; fix small clear ones here with a test; file larger ones as tasks with the screenshot attached.
- [ ] Quit any app instance you launched; never touch Nick's running Hub instance or its saved data (use a temporary copy of the app support folder or a different defaults domain).
- [ ] The report lists each screen checked with a screenshot reference; if the app cannot be exercised headlessly, say exactly what was and was not verified.

## Notes for AI

Do not edit repoos.toml. Do not create signing identities or commit app binaries.

## Activity

- 2026-11-17T18:23:18Z · created · t@t
- 2026-11-17T18:23:23Z · cli_override, model_override
