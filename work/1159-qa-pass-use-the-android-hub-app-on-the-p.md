---
id: "1159"
title: "QA pass: use the Android Hub app on the phone, find broken things and fix them"
type: bug
status: active
priority: p1
area: mobile
depends_on: ["1162"]
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-use-the-android-hub-app-on-the-p
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-17T15:51:18Z"
updated_at: "2026-11-17T17:59:57Z"
handoff_signal_retry_count: 2
engineer_stall_resume_log: "[{\"at\":\"2026-11-17T16:23:57.721Z\",\"reason\":\"clean-exit-without-handoff\"},{\"at\":\"2026-11-17T17:28:58.663Z\",\"reason\":\"clean-exit-without-handoff\"},{\"at\":\"2026-11-17T17:40:28.839Z\",\"reason\":\"clean-exit-without-handoff\"}]"
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

## Screenshots

![add-server.png](/api/tasks/1159/attachments/att_9927f217-4dc6-4a4c-ba20-6b06cc134c70.png)
![add-server-empty-error.png](/api/tasks/1159/attachments/att_191c73fc-61ec-4341-b0dc-d5327efe70f3.png)
![add-server-error-cleared.png](/api/tasks/1159/attachments/att_1c89da5f-5141-41cc-b511-55e551466b2e.png)
![back-gesture-picker.png](/api/tasks/1159/attachments/att_45004327-66b7-4ed2-9db3-3d9a91e249d9.png)
![edit-server.png](/api/tasks/1159/attachments/att_3dee13a9-eac1-43e6-8708-4330567ba653.png)
![lock-enabled.png](/api/tasks/1159/attachments/att_7519943d-eeac-434e-be98-bcd803bff182.png)
![lock-fail-closed-final.png](/api/tasks/1159/attachments/att_e1e8cbaa-93ec-482d-8bec-bfa1eb911f8c.png)
![remove-server.png](/api/tasks/1159/attachments/att_b0097e54-a347-4804-979a-99a160142115.png)
![server-back-gesture.png](/api/tasks/1159/attachments/att_58d2fba1-4758-45f2-b061-25ba2f2ddda4.png)
![server-list-final.png](/api/tasks/1159/attachments/att_d837d11c-a196-4050-bc6c-ea73fa58759d.png)
![server-open.png](/api/tasks/1159/attachments/att_3ec230f7-132b-46ee-aeb9-7db02680d5c2.png)
![settings-dark-final.png](/api/tasks/1159/attachments/att_c52734ad-a43f-4e85-867d-987a874a44d2.png)
![settings-light.png](/api/tasks/1159/attachments/att_50cb67d9-db1f-421e-83f5-ef616ebc2688.png)
![tailnet-discovery.png](/api/tasks/1159/attachments/att_ea0dc857-5437-43d5-9c2f-f445c3b32833.png)

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
- 2026-11-17T17:23:56Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: I reread #1159 from the current RepoOS board. The updated note confirms the device requirement is still outstanding. ADB still shows no attached device, so I can’t complete the native QA pass; the task remains active. Please provide an ava… · stderr: 2026-11-17T16:33:30.700724Z ERROR codex_core::session: failed to record rollout items: thread 01a1ea59-b92c-7db2-bcad-f880d3eccb6d not found Reading additional input from stdin... Reading additional input from stdin...
- 2026-11-17T17:28:58Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 1/3
- 2026-11-17T17:33:54Z · depends_on
- 2026-11-17T17:35:05Z · body
- 2026-11-17T17:35:25Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The Android QA pass is still blocked: the saved ADB target refused connection, and `adb devices -l` showed no device. I captured no Android screenshots and made no claims about screens or defects. Created held human task **#1162** for the … · stderr: Reading additional input from stdin...
- 2026-11-17T17:40:28Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 2/3
- 2026-11-17T17:59:33Z · screenshots
- 2026-11-17T17:59:35Z · screenshots
- 2026-11-17T17:59:37Z · screenshots
- 2026-11-17T17:59:39Z · screenshots
- 2026-11-17T17:59:41Z · screenshots
- 2026-11-17T17:59:42Z · screenshots
- 2026-11-17T17:59:44Z · screenshots
- 2026-11-17T17:59:46Z · screenshots
- 2026-11-17T17:59:48Z · screenshots
- 2026-11-17T17:59:50Z · screenshots
- 2026-11-17T17:59:51Z · screenshots
- 2026-11-17T17:59:53Z · screenshots
- 2026-11-17T17:59:55Z · screenshots
- 2026-11-17T17:59:57Z · screenshots
