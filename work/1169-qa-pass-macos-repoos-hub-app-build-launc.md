---
id: "1169"
title: "QA pass: macOS RepoOS Hub app – build, launch, connect, and fix what is broken"
type: bug
status: review
priority: p2
area: macos
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-macos-repoos-hub-app-build-launc
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-18T02:19:44Z"
updated_at: "2026-11-18T06:22:31Z"
review_rounds: 1
review_passes: 5
engineer_stall_resume_log: "[{\"at\":\"2026-11-18T04:39:18.645Z\",\"reason\":\"clean-exit-without-handoff\"},{\"at\":\"2026-11-18T04:49:19.309Z\",\"reason\":\"clean-exit-without-handoff\"}]"
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
- 2026-11-18T04:25:40Z · message_queued at 2026-11-18T04:25:40.228Z
- 2026-11-18T04:27:12Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-18T04:28:44Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-18T04:28:46Z · message_delivered: 1 message(s)
- 2026-11-18T04:33:40Z · body
- 2026-11-18T04:34:18Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The scoped check passed: build, lint, tests, and UI smoke test were green. RepoOS checkpointed the current tree during the check. I can’t request handoff yet: signed-in projects and tasks remain unverified, and human task #1174 is still in… · stderr: Reading additional input from stdin...
- 2026-11-18T04:39:18Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 1/3
- 2026-11-18T04:42:53Z · body
- 2026-11-18T04:44:14Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The **scoped RepoOS check passed**. I corrected the QA record to say human-assigned task #1174 has no result yet, and updated the engineering report draft with this check’s result and the remaining gap. The existing branch changes also add… · stderr: Reading additional input from stdin... 2026-11-18T04:40:57.848699Z ERROR codex_core::tools::router: error=apply_patch verification failed: Failed to find expected lines in /Users/nick/code/nick/repoos-worktrees/feat/qa-pass-macos-repoos-hub-app-build-launc/docs/qa/2026-11-macos-hub-qa.md: separate #1167 QA pass exerci…
- 2026-11-18T04:49:19Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 2/3
- 2026-11-18T04:51:48Z · body
- 2026-11-18T04:54:15Z · status active→review
- 2026-11-18T04:54:16Z · message_queued at 2026-11-18T04:54:16.837Z
- 2026-11-18T04:54:18Z · note: shots: skipped — the diff (11 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-18T04:55:04Z · note: review pass 4: needs some work
- 2026-11-18T05:17:39Z · status review→active
- 2026-11-18T05:17:41Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-18T05:17:41Z · message_delivered: 1 message(s)
- 2026-11-18T05:22:42Z · body
- 2026-11-18T05:23:22Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: `repoos check --changed main` passed on the current tree. I didn’t request another review: the newest report says #1174’s signed-in results are required before sign-off, and that human task still has no results. My attempt to inspect the c… · stderr: (empty)
- 2026-11-18T05:23:23Z · note: handoff requested (cli)
- 2026-11-18T05:27:12Z · CTO nudge: held — handoff gate is running
- 2026-11-18T05:40:54Z · message_queued at 2026-11-18T05:40:54.685Z
- 2026-11-18T05:40:54Z · handoff failed · task-file handoff failed at review · Engineering report draft is missing: .repoos/engineering-report-drafts/1169.md
- 2026-11-18T05:40:55Z · message_delivered: 1 message(s)
- 2026-11-18T05:54:40Z · body
- 2026-11-18T05:55:34Z · status active→review
- 2026-11-18T05:55:35Z · note: shots: skipped — the diff (12 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-18T05:56:36Z · status review→active
- 2026-11-18T05:56:37Z · message_queued at 2026-11-18T05:56:37.659Z
- 2026-11-18T05:56:38Z · CTO nudge: held — handoff gate is running
- 2026-11-18T06:05:16Z · status active→review
- 2026-11-18T06:05:16Z · message_queued at 2026-11-18T06:05:16.637Z
- 2026-11-18T06:05:16Z · note: shots: skipped — the diff (14 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-18T06:05:17Z · note: review pass 5: needs some work
- 2026-11-18T06:05:17Z · message_delivered: 2 message(s)
- 2026-11-18T06:05:17Z · status review→active
- 2026-11-18T06:17:30Z · watchdog: restarting engineer after 12m with no live process
- 2026-11-18T06:21:35Z · body
- 2026-11-18T06:22:11Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The scoped check passed on `409d6fd0a9b5898f0fcad395fd87226067c3ba33`. I saved the required 994-word engineer report draft at [.repoos/engineering-report-drafts/1169.md](/Users/nick/code/nick/repoos-worktrees/feat/qa-pass-macos-repoos-hub-… · stderr: Reading additional input from stdin...
- 2026-11-18T06:22:12Z · note: handoff requested (cli)
- 2026-11-18T06:22:12Z · CTO nudge: held — handoff gate is running
- 2026-11-18T06:22:31Z · status active→review
