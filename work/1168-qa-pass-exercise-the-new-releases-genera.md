---
id: "1168"
title: "QA pass: exercise the new Releases 'Generate AI notes and publish' flow and the update/restart modal end to end"
type: bug
status: active
priority: p1
area: [web, server]
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-exercise-the-new-releases-genera
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-18T00:17:51Z"
updated_at: "2026-11-18T01:53:06Z"
handoff_signal_retry_count: 2
review_rounds: 1
review_passes: 1
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

## Screenshots

![release-chooser-1440-light](/api/tasks/1168/attachments/att_c9a0ec4e-af2c-48ee-8415-f0ff9b7091c6.png)
![release-chooser-390-light](/api/tasks/1168/attachments/att_2f792cfd-0b0f-4658-a519-daa77108ae66.png)
![release-chooser-publish-1440-light](/api/tasks/1168/attachments/att_787ab4a4-428b-4de7-ae4a-ba3f9a4122e2.png)
![release-notify-pending-390-light](/api/tasks/1168/attachments/att_75ea0d99-11d8-43ab-b8ec-1bd9a16e8cf2.png)
![release-notify-reloaded-390-light](/api/tasks/1168/attachments/att_7ab2194a-d286-4db7-93c5-0ce259fad026.png)
![release-publish-pending-1440-light](/api/tasks/1168/attachments/att_e2271c10-7c3d-4f15-940b-6162297268ce.png)
![release-publish-reloaded-1440-light](/api/tasks/1168/attachments/att_30e14b30-c651-42c4-b227-74b8343021ed.png)
![release-failed-draft-1440-light](/api/tasks/1168/attachments/att_12dc4cd6-7e60-4ace-90c5-0854dc5e94cd.png)
![restart-hand-run-1440-light](/api/tasks/1168/attachments/att_bce9e4e5-d2a5-4920-9d7a-c00073de30f3.png)
![restart-hand-run-1440-dark](/api/tasks/1168/attachments/att_e601a156-ab16-4647-bf7e-c8d4f042032c.png)
![restart-hand-run-390-light](/api/tasks/1168/attachments/att_eba8cd88-d8ce-4319-a368-2c18e2d7387f.png)
![restart-hand-run-390-dark](/api/tasks/1168/attachments/att_92d78643-274f-472d-aa78-02fb37456332.png)
![restart-launchd-1440-light](/api/tasks/1168/attachments/att_29cfff48-151b-4c90-b25d-46067c84b178.png)
![restart-launchd-1440-dark](/api/tasks/1168/attachments/att_7a752f51-4b6b-48fe-9993-551881e08b1c.png)
![restart-launchd-390-light](/api/tasks/1168/attachments/att_90bbfa62-8ce3-4161-808a-be8661cce089.png)
![restart-launchd-390-dark](/api/tasks/1168/attachments/att_f0b56ec8-b551-4572-bf4c-39ba9daa000c.png)
![restart-systemd-1440-light](/api/tasks/1168/attachments/att_68846ac7-ed10-4347-a33c-5d1e32b340ee.png)
![restart-systemd-1440-dark](/api/tasks/1168/attachments/att_bd1a98f8-bd24-433f-8f68-57b1942df9b4.png)
![restart-systemd-390-light](/api/tasks/1168/attachments/att_86f20a7b-5c1d-4585-9c5f-2255421bdbfa.png)
![restart-systemd-390-dark](/api/tasks/1168/attachments/att_c975cdc6-6f47-491e-90f1-7b3a086d57af.png)
![restart-uncertain-1440-light](/api/tasks/1168/attachments/att_e035bc07-9589-4e14-8783-1063d9e96f75.png)
![restart-uncertain-1440-dark](/api/tasks/1168/attachments/att_595bc2c4-4b19-4aed-929f-cc053088be06.png)
![restart-uncertain-390-light](/api/tasks/1168/attachments/att_0d4fef98-e73e-4df1-b9e8-5d6ab88a3c6b.png)
![restart-uncertain-390-dark](/api/tasks/1168/attachments/att_44179bd2-3b4c-47bc-85f8-a1f03ea5799b.png)

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
- 2026-11-18T00:57:59Z · message_queued at 2026-11-18T00:57:59.952Z
- 2026-11-18T00:58:00Z · note: shots: skipped — the diff (3 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-18T01:07:30Z · note: review pass 1: needs some work
- 2026-11-18T01:07:31Z · message_delivered: 1 message(s)
- 2026-11-18T01:07:32Z · status review→active
- 2026-11-18T01:28:22Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: I fixed the count pluralization and corrected the new test; `releases.test.ts` now passes all 44 tests. The full `REPOOS_CHECK_CHANGED=main repoos check` did **not** pass: its scoped test run exposed an incorrect assertion in my new uncert… · stderr: 2026-11-18T01:21:02.772789Z ERROR codex_core::tools::router: error=write_stdin failed: Unknown process id 97737 2026-11-18T01:22:46.085568Z ERROR codex_core::tools::router: error=write_stdin failed: Unknown process id 74094 2026-11-18T01:27:41.475550Z ERROR codex_core::tools::router: error=Exit code: 1 Wall time: 0 se…
- 2026-11-18T01:36:19Z · body
- 2026-11-18T01:38:41Z · body
- 2026-11-18T01:47:45Z · screenshots
- 2026-11-18T01:49:35Z · body
- 2026-11-18T01:53:06Z · CTO nudge: held — handoff gate is running
