---
id: "1159"
title: "QA pass: use the Android Hub app on the phone, find broken things and fix them"
type: bug
status: active
priority: p1
area: mobile
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-use-the-android-hub-app-on-the-p
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-17T15:51:18Z"
updated_at: "2026-11-17T17:23:29Z"
handoff_signal_retry_count: 2
engineer_stall_resume_log: "[{\"at\":\"2026-11-17T16:23:57.721Z\",\"reason\":\"clean-exit-without-handoff\"}]"
---
## Problem

Nick wants the apps actually used, not only unit tested. The Android Hub (RepoOS Hub Dev, org.repoos.mobile.dev) has changed a lot (new picker, themes, Settings, tailnet discovery, back gesture) and nobody has driven it end to end.

## Desired UX

Every Hub screen works on the phone: server list, add server, edit/remove, Settings, themes light/dark, tailnet discovery, opening a server and returning to the picker, the lock screen, and the system back gesture.

## Acceptance criteria

- [ ] Using the phone over adb (the phone config is in ~/.config/repoos-hub/phone; if it cannot connect, say so and fall back to the Android emulator or the web fixtures at /?fixture=...&platform=android) or an emulator, take screenshots with adb exec-out screencap and look at every one yourself: server list, Add server, tailnet discovery, Settings, each theme in light and dark, a server open, the back gesture.
- [ ] Record every defect (overlap, clipping, wrong colors, unreadable text, broken navigation, crash, console or logcat errors).
- [ ] Fix small clear defects here with a test each; file larger ones as separate tasks with the screenshot attached.
- [ ] The report lists each screen checked, the defects found, fixed and filed; no screen is reported without a screenshot. Never capture anything except the phone or emulator screen, and do not install anything but the dev variant.

## Notes for AI
Use `just deploy-phone` only if the saved port works; otherwise do not ask Nick for secrets. Do not edit `repoos.toml`.

Human device step needed: the saved ADB target `100.117.244.33:37673` refused the connection on 2026-11-18; `adb devices -l` was empty and no emulator executable was available. Desktop browser fixtures were inspected but do not satisfy the phone/emulator screenshot or native Android interaction criteria. Please split the remaining device pass into a held human task (or provide an available Android device/emulator) before this QA task is resumed. No device results are claimed.


## Activity

- 2026-11-17T15:51:18Z · created · t@t
- 2026-11-17T15:51:34Z · cli_override, model_override
- 2026-11-17T15:51:38Z · status inbox→ready
- 2026-11-17T15:51:41Z · status ready→active, branch
- 2026-11-17T15:56:45Z · message_queued at 2026-11-17T15:56:45.622Z
- 2026-11-17T15:59:29Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-17T16:02:25Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: **Blocked: the required Android device QA is incomplete.** The saved wireless adb target was unreachable, `adb devices` showed no device, and no Android SDK emulator was available. I did not install anything or run `just deploy-phone`. I u… · stderr: Reading additional input from stdin...
- 2026-11-17T16:07:30Z · message_queued at 2026-11-17T16:07:30.801Z
- 2026-11-17T16:12:26Z · message_delivered: 1 message(s)
- 2026-11-17T16:14:19Z · body
- 2026-11-17T16:14:27Z · queued message undelivered for 7m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-17T16:14:27Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: The phone is still unreachable. The scoped check has started remotely; the worktree has no changed paths against `main`, so this run can validate the current tree but cannot complete the device-dependent acceptance criteria. · stderr: Reading additional input from stdin...
- 2026-11-17T16:15:12Z · message_delivered: 1 message(s)
- 2026-11-17T16:17:56Z · body
- 2026-11-17T16:18:46Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: `REPOOS_CHECK_CHANGED=main repoos check` passed. The saved phone target is still unreachable, and there is no emulator available, so the required QA remains incomplete: most screens and native behaviors lack the required device evidence. I… · stderr: 2026-11-17T16:15:15.333134Z ERROR codex_core::util: Custom tool call output is missing for call id: call_243421e6f6a4479b82c1312f154b7413 2026-11-17T16:15:37.458899Z ERROR codex_core::util: Custom tool call output is missing for call id: call_243421e6f6a4479b82c1312f154b7413 2026-11-17T16:15:43.633953Z ERROR codex_cor…
- 2026-11-17T16:23:57Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 1/3
- 2026-11-17T16:28:58Z · watchdog: auto-surfaced stuck task · status active→ready · agent exited without emitting the handoff signal · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-11-17T17:10:03Z · status ready→active
- 2026-11-17T17:12:28Z · body
- 2026-11-17T17:12:49Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: **Blocked: device QA is incomplete.** The saved phone target’s port was unreachable, `adb devices -l` showed no device, and no Android emulator or SDK was available. I did not install anything or run `just deploy-phone`. I could not captur… · stderr: Reading additional input from stdin...
- 2026-11-17T17:17:50Z · CTO action: restart-stalled-agent (fresh) · agent exited without emitting the handoff signal
- 2026-11-17T17:20:43Z · body: Notes for AI (added 2, removed 1)
- 2026-11-17T17:20:43Z · message_queued at 2026-11-17T17:20:43.912Z
- 2026-11-17T17:21:15Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The Android QA pass is **blocked**: the saved ADB target refused the connection, no device was attached, and no emulator was available. I used the Android web fixtures and visually inspected screenshots of the server list, Add server, tail… · stderr: Reading additional input from stdin...
- 2026-11-17T17:23:29Z · message_delivered: 1 message(s)
