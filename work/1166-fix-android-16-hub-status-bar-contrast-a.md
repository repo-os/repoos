---
id: "1166"
title: Fix Android 16 Hub status-bar contrast across themes
type: bug
status: done
priority: p2
area: mobile
merged_commit: 752e563e32f39aab1e5c75269568215d0d3f46b6
assigned_to: ai
created_by: t@t
branch: feat/fix-android-16-hub-status-bar-contrast-a
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-17T17:55:45Z"
updated_at: "2026-11-17T20:08:23Z"
last_close_out_gate_ms: 1236372
last_close_out_gate_at: "2026-11-17T20:08:23.149Z"
review_passes: 2
review_rounds: 1
last_check_failure: "repoos check at 2026-11-17T19:05:59.283Z: repoos check failed: reused check inputs changed during handoff — run the check again"
handoff_signal_retry_count: 2
---
## Problem
On Android 16 (API 36), the Hub theme changes the status-bar icon style but the status-bar background remains a light system strip. In Dark appearance, white status icons are nearly invisible against that light strip. Android 16 ignores the status-bar color request for apps targeting API 36, so the native edge-to-edge treatment needs a platform-aware fix.

## Acceptance criteria
- Status-bar text and icons remain readable in both Light and Dark appearance on Android 16.
- The status bar background matches the active Hub theme where the platform allows it.
- Top content remains below the status bar and does not overlap it.
- Verify with emulator screenshots in Light and Dark appearances.

## Reproduction
1. Install RepoOS Hub Dev on an Android 16 device or emulator.
2. Open Settings and choose Dark appearance.
3. Observe the system status bar above the app.

## Evidence
Captured on the Pixel 8 API 36 emulator during task #1159: `theme-classic-dark.png`. White status icons appear faint against the light status-bar strip.

## Notes for AI
This issue was observed on Android 16 (API 36), target SDK 36, with Android System WebView 133.0.6943.137. A trial using `StatusBar.setOverlaysWebView({ overlay: true })` generated a Capacitor safe-area injection error and left the app view blank, so that approach was reverted. Find a fix that preserves the Hub's safe-area layout.

## Screenshots

![Dark theme status bar has pale background and low-contrast white icons](/api/tasks/1166/attachments/att_bfeae21b-50ac-4757-b9e6-c6c6a5f3c7f6.png)
![Dark theme status icons nearly disappear against the light Android 16 status bar](/api/tasks/1166/attachments/att_842272d3-a648-4d4b-8812-d220baba3186.png)

## Activity

- 2026-11-17T17:55:45Z · created · t@t
- 2026-11-17T17:55:46Z · screenshots
- 2026-11-17T17:55:47Z · needs_input
- 2026-11-17T17:56:16Z · body: Problem (added); Acceptance criteria (added); Reproduction (added); Evidence (added); Notes for AI (added); Problem\nOn Android 16 (API 36), the Hub theme changes the status-bar icon style but the status bar background remains a light system strip. In dark appearance, white status icons become nearly invisible against that light strip. The status bar color API is ignored for apps targeting API 36, so the native edge-to-edge treatment needs a platform-aware fix.\n\n## Reproduction\n1. Install RepoOS Hub Dev on an Android 16 device or emulator.\n2. Open Settings and choose Dark appearance.\n3. Observe the system status bar above the app.\n\n## Expected\nStatus bar background and icon colors maintain readable contrast with the active Hub theme without covering the top content.\n\n## Evidence\nCaptured on the Pixel 8 API 36 emulator during task #1159: theme-classic-dark.png. The white status icons are faint against the light status-bar strip.\n (removed)
- 2026-11-17T17:56:18Z · screenshots
- 2026-11-17T18:23:40Z · cli_override, model_override
- 2026-11-17T18:23:46Z · status inbox→ready
- 2026-11-17T18:23:49Z · status ready→active, needs_input, branch
- 2026-11-17T18:29:03Z · message_queued at 2026-11-17T18:29:03.587Z
- 2026-11-17T18:30:39Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-17T18:37:37Z · body
- 2026-11-17T18:38:06Z · queued message undelivered for 9m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-17T18:38:07Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: The check has verified the scoped branch snapshot and is building on the RepoOS validation runner; it has not reported a failure so far. The diff is limited to the Android theme resource. Since the task explicitly requires API 36 Light/Dar… · stderr: Reading additional input from stdin...
- 2026-11-17T18:43:25Z · message_queued at 2026-11-17T18:43:25.523Z
- 2026-11-17T18:48:39Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-11-17T18:48:40Z · note: handoff requested (cli)
- 2026-11-17T18:50:11Z · message_queued at 2026-11-17T18:50:11.711Z
- 2026-11-17T18:50:11Z · handoff failed · task-file handoff failed at review · Engineering report draft is missing: .repoos/engineering-report-drafts/1166.md
- 2026-11-17T18:52:56Z · message_delivered: 1 message(s)
- 2026-11-17T18:54:52Z · queued message undelivered for 11m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-17T18:54:52Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: The remote validation passed, including the browser gate and 98 scoped tests. The local guard phase is rebuilding now; after it finishes I’ll record the implementation and the unavailable emulator proof in the required report draft. The AP… · stderr: 2026-11-17T18:53:04.704426Z ERROR codex_core::tools::router: error=write_stdin failed: Unknown process id 35864
- 2026-11-17T18:54:55Z · orphaned run process stopped · pid 40054 · ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 -o ServerAliveInterval · cpu 0s · age 1m
- 2026-11-17T19:02:49Z · message_delivered: 2 message(s)
- 2026-11-17T19:04:51Z · body
- 2026-11-17T19:05:36Z · CTO nudge: held — handoff gate is running
- 2026-11-17T19:05:56Z · message_queued at 2026-11-17T19:05:56.544Z
- 2026-11-17T19:07:50Z · message_delivered: 1 message(s)
- 2026-11-17T19:09:55Z · body
- 2026-11-17T19:10:36Z · status active→review
- 2026-11-17T19:10:36Z · message_queued at 2026-11-17T19:10:36.680Z
- 2026-11-17T19:10:36Z · note: shots: skipped — the diff (3 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-17T19:15:49Z · note: review pass 1: back to the drawing board
- 2026-11-17T19:15:50Z · message_delivered: 1 message(s)
- 2026-11-17T19:15:50Z · status review→active
- 2026-11-17T19:16:16Z · note: Review round 1 returned findings; resuming implementation for round 2.
- 2026-11-17T19:21:10Z · body
- 2026-11-17T19:22:20Z · status active→review
- 2026-11-17T19:22:21Z · message_queued at 2026-11-17T19:22:21.122Z
- 2026-11-17T19:22:21Z · note: shots: skipped — the diff (9 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-17T19:26:55Z · note: review pass 2: good to go
- 2026-11-17T20:08:23Z · close-out gate completed in 1236s

