---
id: "1169"
title: "QA pass: macOS RepoOS Hub app – build, launch, connect, and fix what is broken"
type: bug
status: active
priority: p2
area: macos
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-macos-repoos-hub-app-build-launc
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-18T02:19:44Z"
updated_at: "2026-11-18T04:25:11Z"
review_passes: 3
---
## Problem
Nick reports the macOS Hub app has been unusable for weeks. Nobody has recently built and driven it.
## Desired UX
App builds, launches, discovers servers, connects, and shows projects/tasks without errors.
## Acceptance criteria
- Build with xcodebuild (CODE_SIGNING_ALLOWED=NO, own derivedDataPath); launch it; capture window-only screenshots (screencapture -l<windowid>, never the full screen).
- Fix every crash/blank/broken screen found, with tests where possible.
- Commit a record docs/qa/2026-11-macos-hub-qa.md listing what was checked and fixed.
## Notes for AI
Never capture the whole screen. Do not touch repoos.toml.

## Not verified
Signed-in projects and tasks remain unverified because automated email-code entry did not reach the signed-in web UI. Held human follow-up #1174 now tracks this step; #1172 was not present in this worktree. Do not treat this criterion as complete until #1174 reports results.

## Activity

- 2026-11-18T02:19:44Z · created · t@t
- 2026-11-18T02:20:04Z · status inbox→ready
- 2026-11-18T02:20:08Z · cli_override, model_override
- 2026-11-18T02:20:10Z · status ready→active, branch
- 2026-11-18T02:28:31Z · CTO nudge: held — handoff gate is running
- 2026-11-18T02:30:09Z · status active→review
- 2026-11-18T02:30:10Z · message_queued at 2026-11-18T02:30:10.287Z
- 2026-11-18T02:30:10Z · note: shots: skipped — the diff (3 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-18T02:32:57Z · note: review pass 1: needs some work
- 2026-11-18T02:47:35Z · status review→active
- 2026-11-18T02:47:37Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-18T02:47:37Z · message_delivered: 1 message(s)
- 2026-11-18T02:51:36Z · status active→review
- 2026-11-18T02:51:37Z · note: shots: skipped — the diff (9 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-18T02:51:43Z · message_queued at 2026-11-18T02:51:43.250Z
- 2026-11-18T02:56:48Z · watchdog: auto-retried dead reviewer session · the reviewer agent produced no report and its session ended — starting a fresh review
- 2026-11-18T03:01:58Z · watchdog: escalated to needs_input · reviewer session died and the automatic retry did not recover it — the review agent may be misconfigured · next step: resume the session manually from the task's worktree and check for uncommitted work
- 2026-11-18T03:17:45Z · status review→active
- 2026-11-18T03:17:47Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-18T03:17:48Z · needs_input
- 2026-11-18T03:17:48Z · message_delivered: 1 message(s)
- 2026-11-18T03:19:54Z · body
- 2026-11-18T03:20:26Z · status active→review
- 2026-11-18T03:20:26Z · note: shots: skipped — the diff (6 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-18T03:20:51Z · message_queued at 2026-11-18T03:20:51.679Z
- 2026-11-18T03:27:20Z · note: review pass 2: needs some work
- 2026-11-18T03:40:30Z · cli_override, model_override
- 2026-11-18T03:40:46Z · status review→active
- 2026-11-18T03:40:48Z · message_delivered: 1 message(s)
- 2026-11-18T03:45:49Z · body
- 2026-11-18T03:49:00Z · body
- 2026-11-18T03:49:34Z · status active→review
- 2026-11-18T03:49:35Z · note: shots: skipped — the diff (9 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-18T03:49:58Z · message_queued at 2026-11-18T03:49:58.287Z
- 2026-11-18T03:50:26Z · note: review pass 3: needs some work
- 2026-11-18T03:57:57Z · status review→active
- 2026-11-18T03:57:58Z · watchdog: restarting engineer because a queued message waited 8m with no live process
- 2026-11-18T03:58:00Z · message_delivered: 1 message(s)
- 2026-11-18T03:58:00Z · message_queued at 2026-11-18T03:58:00.650Z
- 2026-11-18T04:02:12Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-18T04:02:12Z · body
- 2026-11-18T04:06:17Z · body
- 2026-11-18T04:07:36Z · body: Not verified (added)
- 2026-11-18T04:07:36Z · message_queued at 2026-11-18T04:07:36.755Z
- 2026-11-18T04:09:28Z · queued message undelivered for 11m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-18T04:09:29Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: I filed held human follow-up #1174 and updated the QA record and task notes to point to it. The final scoped gate is running once more after those documentation changes; once green, I’ll save the required engineer report draft and stop wit… · stderr: Reading additional input from stdin... 2026-11-18T03:59:27.261958Z ERROR codex_core::tools::router: error=apply_patch verification failed: Failed to find expected lines in /Users/nick/code/nick/repoos-worktrees/feat/qa-pass-macos-repoos-hub-app-build-launc/docs/qa/2026-11-macos-hub-qa.md: The focused XCTest `ServerReg…
- 2026-11-18T04:09:29Z · status active→review
- 2026-11-18T04:09:29Z · message_delivered: 2 message(s)
- 2026-11-18T04:09:29Z · note: handoff requested (cli)
- 2026-11-18T04:12:12Z · CTO nudge: held — handoff gate is running
- 2026-11-18T04:14:15Z · body
- 2026-11-18T04:25:11Z · handoff failed · task-file handoff failed at check · the worktree changed while the gate was running (HEAD moved from 113b674b to 34fd29e7; commit "Merge main into task #1169" touched docs/qa/2026-11-android-hub-fixtures.md, docs/qa/2026-11-releases-and-restart-qa.md, mobile/scripts/fixture-qa.ts, mobile/src/style.css, repoos.toml, src/ui-app/src/components/ReleaseUpdateNotification.vue, src/ui-app/tests/mobile-hub-picker-layout.test.ts, src/ui-app/tests/releases.test.ts) — the check result no longer describes what is committed, so the handoff was refused. Nothing was lost: the change is still in the worktree. Re-run the handoff once the worktree is stable.
