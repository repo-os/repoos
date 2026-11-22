---
id: "1284"
title: "Mac Hub: Local server will not start (env: node: No such file or directory) and removing then re-adding it crashes the app"
type: bug
status: active
priority: p1
area: macos
assigned_to: ai
created_by: t@t
branch: feat/mac-hub-local-server-will-not-start-env-
cli_override: claude code
model_override: haiku
created_at: "2026-11-22T03:29:23Z"
updated_at: "2026-11-22T12:51:29Z"
review_rounds: 2
review_passes: 2
---
## Problem
In the native RepoOS Hub Mac app, starting the local server for the repo called divot repoos fails with the dialog 'Local server: env: node: No such file or directory'. Removing that server and adding it again makes the app crash. The user could not start the server or recover from inside the app.

## Desired UX
- Starting a local server from the Hub works regardless of how the app was launched. A missing runtime produces a clear, plain-English message that says what is missing and how to fix it, never a raw env error.
- Removing and re-adding a server never crashes the app; any invalid or half-created server entry is handled gracefully (error shown, entry can be removed).

## Acceptance criteria
- Reproduce and fix the 'env: node: No such file or directory' failure. Likely cause to check first: the app is launched from Finder/Dock with a minimal PATH (no Homebrew or ~/.local/bin or ~/.bun/bin), so repoos's shebang or the server launch cannot find node or bun. Resolve the runtime explicitly (known install locations, a login-shell PATH, or the Bun path recorded by repoos) instead of relying on PATH; keep the Bun-by-default convention in AGENTS.md.
- Find and fix the crash on remove then add again (collect the crash log from ~/Library/Logs/DiagnosticReports or the app's own logs; add a regression test or a scripted repro).
- Add tests where possible (launch environment with a stripped PATH) and update the macOS Hub docs.
- Anything needing a signed build or a real Mac run is split into a separate human-verify task, per the human-step rule; do not claim it verified.

## Notes for AI
Look in the macos Hub app sources and the local-server launcher. Never touch repoos.toml. Do not open visible windows or steal focus when testing; only capture the app's own windows.

## Screenshots

![Mac Hub app dialog: Local server - env: node: No such file or directory](/api/tasks/1284/attachments/att_073b66d5-fe29-4bda-a177-38b5c9e56d28.png)

## Activity

- 2026-11-22T03:29:23Z · created · t@t
- 2026-11-22T03:29:24Z · screenshots
- 2026-11-22T03:29:29Z · status inbox→ready
- 2026-11-22T12:27:08Z · cli_override, model_override
- 2026-11-22T12:27:08Z · status ready→active, branch
- 2026-11-22T12:39:16Z · body
- 2026-11-22T12:41:09Z · status active→review
- 2026-11-22T12:41:09Z · message_queued at 2026-11-22T12:41:09.888Z
- 2026-11-22T12:41:10Z · note: shots: skipped — Docs site skipped: no docs shot declared
- 2026-11-22T12:42:41Z · note: review pass 1: needs some work
- 2026-11-22T12:42:42Z · status review→active
- 2026-11-22T12:42:44Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-22T12:43:34Z · message_delivered: 1 message(s)
- 2026-11-22T12:48:37Z · body
- 2026-11-22T12:50:06Z · status active→review
- 2026-11-22T12:50:06Z · message_queued at 2026-11-22T12:50:06.797Z
- 2026-11-22T12:50:07Z · note: shots: skipped — Docs site skipped: no docs shot declared
- 2026-11-22T12:51:28Z · note: review pass 2: needs some work
- 2026-11-22T12:51:29Z · message_delivered: 1 message(s)
- 2026-11-22T12:51:29Z · status review→active
