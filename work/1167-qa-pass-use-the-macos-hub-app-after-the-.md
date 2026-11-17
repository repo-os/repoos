---
id: "1167"
title: "QA pass: use the macOS Hub app after the #1155 fix, find broken things and fix them"
type: bug
status: review
priority: p1
area: macos
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-use-the-macos-hub-app-after-the-
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-17T18:23:18Z"
updated_at: "2026-11-17T20:02:27Z"
review_rounds: 1
review_passes: 1
handoff_signal_retry_count: 2
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

## Screenshots

![Round 2: fresh isolated empty Hub in Dark appearance](/api/tasks/1167/attachments/att_4e48f2e4-8639-4bd8-a0e4-afb49025773f.png)
![Round 2: actual RepoOS Control UI loaded in the Hub web view](/api/tasks/1167/attachments/att_22912733-5e04-494d-8fac-bee3330b1c37.png)
![Round 2: after stopping preview, sidebar is Offline and red with the offline overlay](/api/tasks/1167/attachments/att_c5a20df2-52c7-4166-976d-f339443e941d.png)
![Round 2: fresh launch preserves an Offline red row and offline actions](/api/tasks/1167/attachments/att_a083bd53-52d1-4f59-be9c-719eb37e62a7.png)

## Activity

- 2026-11-17T18:23:18Z · created · t@t
- 2026-11-17T18:23:23Z · cli_override, model_override
- 2026-11-17T18:23:28Z · status inbox→ready
- 2026-11-17T18:23:31Z · status ready→active, branch
- 2026-11-17T18:50:14Z · body
- 2026-11-17T18:52:56Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: I fixed the sidebar subtitle defect: when a server had a repository name, the row showed that name instead of the saved URL. The subtitle now always shows the origin, with a regression test in [ServerSidebarRowLayoutTests.swift](/Users/nic… · stderr: Reading additional input from stdin... 2026-11-17T18:47:04.025907Z ERROR codex_core::tools::router: error=exec_command failed: CreateProcess { message: "Rejected(\"`/bin/zsh -lc \\\"launchctl unsetenv REPOOS_HUB_SUPPORT_DIRECTORY && rm -rf /Users/nick/Library/Caches/RepoOS/task-1167-registry /Users/nick/Library/Caches…
- 2026-11-17T18:58:25Z · message_queued at 2026-11-17T18:58:25.713Z
- 2026-11-17T19:00:39Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-17T19:09:45Z · body
- 2026-11-17T19:09:54Z · queued message undelivered for 11m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-17T19:09:54Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: The final scoped check is running its remote build and changed-path tests now. The screenshot is saved outside the worktree and visually inspected; the preview is stopped, the disposable server row and registry are removed, and the QA app … · stderr: 2026-11-17T19:07:34.610541Z ERROR codex_core::tools::router: error=exec_command failed: CreateProcess { message: "Rejected(\"`/bin/zsh -lc 'rm -f default.profraw /Users/nick/Library/Caches/RepoOS/task-1167-qa-support/servers.json && rmdir /Users/nick/Library/Caches/RepoOS/task-1167-qa-support && REPOOS_CHECK_CHANGED=m…
- 2026-11-17T19:09:55Z · message_delivered: 1 message(s)
- 2026-11-17T19:11:34Z · body
- 2026-11-17T19:12:25Z · status active→review
- 2026-11-17T19:12:26Z · message_queued at 2026-11-17T19:12:26.108Z
- 2026-11-17T19:12:26Z · note: shots: skipped — the diff (6 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-17T19:24:42Z · note: review pass 1: needs some work
- 2026-11-17T19:24:43Z · status review→active
- 2026-11-17T19:24:46Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-17T19:28:56Z · message_delivered: 1 message(s)
- 2026-11-17T19:48:46Z · screenshots
- 2026-11-17T19:57:20Z · body
- 2026-11-17T19:58:41Z · status active→review
- 2026-11-17T19:58:41Z · message_queued at 2026-11-17T19:58:41.535Z
- 2026-11-17T19:58:42Z · note: shots: skipped — the diff (18 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-17T20:02:27Z · note: review pass 2: needs some work
