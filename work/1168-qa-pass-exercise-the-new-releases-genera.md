---
id: "1168"
title: "QA pass: exercise the new Releases 'Generate AI notes and publish' flow and the update/restart modal end to end"
type: bug
status: review
priority: p1
area: [web, server]
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-exercise-the-new-releases-genera
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-18T00:17:51Z"
updated_at: "2026-11-18T00:57:59Z"
last_check_failure: "repoos check at 2026-11-18T00:54:42.638Z: repoos check failed: ui-smoke — [queue] waiting for a Playwright slot — position 2 (1 ahead)"
---
## Problem

#1126 (Generate AI notes and publish) and #1154 (restart modal for a hand-run server) shipped after many review rounds but nobody has driven them like a user, and both are outward-facing (publishing a release, restarting the server).

## Desired UX

In a throwaway task-worktree dev server (never the served checkout), the Releases cut panel opens, the chooser appears, both choices behave as described, cancel works, a failed draft publishes nothing, and the update modal shows a real Restart now action for a hand-run server and a correct command otherwise.

## Acceptance criteria

- [ ] Run the app with just serve-noauth from a scratch worktree on a spare port and drive it with Playwright or a browser: open Releases, open the cut panel, click Generate AI release notes, check the modal wording for both choices (Notify must never say it will publish), pick each, cancel a pending one, and reload during a pending one; use a fake agent or the test seams so no real release is cut and nothing is pushed or tagged.
- [ ] Render the update/restart notice in each supervisor state (hand-run, launchd, systemd) using the existing test fixtures; look at every screenshot yourself at 1440 and 390 widths in light and dark.
- [ ] Record every defect; fix small clear ones with a test each; file larger ones as tasks with the screenshot attached. No screen is reported without a screenshot.
- [ ] Never cut or publish a release, never restart the real server, and never touch the served checkout.

## Notes for AI

Do not edit repoos.toml.

## Activity

- 2026-11-18T00:17:51Z · created · t@t
- 2026-11-18T00:17:54Z · cli_override, model_override
- 2026-11-18T00:17:56Z · status inbox→ready
- 2026-11-18T00:17:58Z · status ready→active, branch
- 2026-11-18T00:28:56Z · body
- 2026-11-18T00:30:46Z · message_queued at 2026-11-18T00:30:46.860Z
- 2026-11-18T00:33:10Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-18T00:33:50Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-18T00:33:51Z · message_delivered: 1 message(s)
- 2026-11-18T00:45:32Z · body
- 2026-11-18T00:47:43Z · message_queued at 2026-11-18T00:47:43.877Z
- 2026-11-18T00:48:30Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-18T00:50:50Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-18T00:50:50Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: The scoped check is on the RepoOS remote validation runner now. It has uploaded the worktree bundle and is building the exact checked tree; no local source paths differed from `main`, so the scoped step set is expected to be small. · stderr: Reading additional input from stdin...
- 2026-11-18T00:50:51Z · message_delivered: 1 message(s)
- 2026-11-18T00:53:30Z · CTO nudge: held — handoff gate is running
- 2026-11-18T00:54:39Z · message_queued at 2026-11-18T00:54:39.480Z
- 2026-11-18T00:54:42Z · message_delivered: 1 message(s)
- 2026-11-18T00:57:59Z · status active→review
