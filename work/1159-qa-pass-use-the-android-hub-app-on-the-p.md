---
id: "1159"
title: "QA pass: use the Android Hub app on the phone, find broken things and fix them"
type: bug
status: review
priority: p1
area: mobile
depends_on: ["1162"]
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-use-the-android-hub-app-on-the-p
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-17T15:51:18Z"
updated_at: "2026-11-17T18:29:45Z"
review_rounds: 1
review_passes: 1
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
The Pixel 8 Android 16 (API 36) emulator was available and used after the saved ADB phone target refused connection. Only org.repoos.mobile.dev was installed. Emulator screenshots are attached to this task. Picker, Add server, edit/remove, Settings, all eight themes in light and dark, no-trusted-server tailnet discovery, example.org in-app open/return via Android back gesture, lock rejection and successful biometric retry were checked. Two defects were fixed with regression tests: URL validation text failed to clear on input, and rejected authentication dismissed the lock overlay. Dark status-bar contrast was filed separately as #1166 with screenshot. The only acceptance gap is discovery against a reachable trusted RepoOS server: dev.repoos.org was unreachable, so no discovery rows or successful RepoOS connection are claimed. Follow-up #1162 is human-assigned and depends on #1159; provide a reachable trusted server and complete the live discovery check before closing this QA task.

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
![theme-classic-light.png](/api/tasks/1159/attachments/att_0e95601b-b893-47a8-b3fc-d1fe9a6cf854.png)
![theme-classic-dark.png](/api/tasks/1159/attachments/att_64053aaa-bc77-4bde-a971-8ab2ce30cc35.png)
![theme-clear-light.png](/api/tasks/1159/attachments/att_00f5be1d-0ced-4af6-bc49-0ea73a36c233.png)
![theme-clear-dark.png](/api/tasks/1159/attachments/att_3d219cd6-f953-4ca7-aecd-3cb9537bd867.png)
![theme-gen-z-light.png](/api/tasks/1159/attachments/att_f1077420-0173-445f-92b3-ace34e6fbf8c.png)
![theme-gen-z-dark.png](/api/tasks/1159/attachments/att_2c40226a-5bfb-4754-8cd9-c23951bc62eb.png)
![theme-jelly-light.png](/api/tasks/1159/attachments/att_a4fa96a2-d6e0-4ef7-b0d3-127d5d5c728b.png)
![theme-jelly-dark.png](/api/tasks/1159/attachments/att_e8142426-5c66-4d13-b727-05bd3ca74bf8.png)
![theme-gruvbox-light.png](/api/tasks/1159/attachments/att_4eb761e3-5030-48da-9a4f-3d1dd99072a1.png)
![theme-gruvbox-dark.png](/api/tasks/1159/attachments/att_5f9e61bb-6012-4fa1-a9ef-a1e083693d90.png)
![theme-catppuccin-light.png](/api/tasks/1159/attachments/att_3574426f-2a10-4e4b-99a7-e052f463b72a.png)
![theme-catppuccin-dark.png](/api/tasks/1159/attachments/att_ebf2fec8-5904-456e-867b-102277754ea2.png)
![theme-solarized-light.png](/api/tasks/1159/attachments/att_4086de16-fb2b-444f-9ca5-f8f7c3f20e53.png)
![theme-solarized-dark.png](/api/tasks/1159/attachments/att_074995c0-f43d-4666-bfc9-7b384b1ea453.png)
![theme-hypercolor-light.png](/api/tasks/1159/attachments/att_53d21987-c43f-457b-b990-2e4e41329aa1.png)
![theme-hypercolor-dark.png](/api/tasks/1159/attachments/att_6a7e00cf-904f-4c2f-bd41-27e1d12a7cd3.png)
![lock-unlocked.png — successful biometric retry returned to the Hub picker](/api/tasks/1159/attachments/att_e4ee97d2-8c8c-4136-881e-0999ae0554dc.png)

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
- 2026-11-17T17:59:59Z · screenshots
- 2026-11-17T18:00:01Z · screenshots
- 2026-11-17T18:00:03Z · screenshots
- 2026-11-17T18:00:05Z · screenshots
- 2026-11-17T18:00:07Z · screenshots
- 2026-11-17T18:00:09Z · screenshots
- 2026-11-17T18:00:10Z · screenshots
- 2026-11-17T18:00:12Z · screenshots
- 2026-11-17T18:00:14Z · screenshots
- 2026-11-17T18:00:16Z · screenshots
- 2026-11-17T18:00:17Z · screenshots
- 2026-11-17T18:00:19Z · screenshots
- 2026-11-17T18:00:21Z · screenshots
- 2026-11-17T18:00:23Z · screenshots
- 2026-11-17T18:00:25Z · screenshots
- 2026-11-17T18:00:27Z · screenshots
- 2026-11-17T18:06:31Z · body: Notes for AI (added 1, removed 2)
- 2026-11-17T18:06:31Z · message_queued at 2026-11-17T18:06:31.612Z
- 2026-11-17T18:06:55Z · screenshots
- 2026-11-17T18:09:34Z · body
- 2026-11-17T18:10:38Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-17T18:11:23Z · body
- 2026-11-17T18:11:44Z · queued message undelivered for 5m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-17T18:11:44Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: The remote build and scoped tests passed, but the local formatting guard found one formatting issue in `App.vue` and correctly skipped dependent steps. I’m applying the repository formatter and rerunning the required check so the final res… · stderr: Reading additional input from stdin... 2026-11-17T17:57:07.473607Z ERROR codex_core::tools::router: error=unable to locate image at `/Users/nick/code/nick/repoos-worktrees/feat/qa-pass-use-the-android-hub-app-on-the-p/.repoos/qa1159/lock-fail-closed-final.png`: No such file or directory (os error 2)
- 2026-11-17T18:11:44Z · message_delivered: 1 message(s)
- 2026-11-17T18:14:19Z · body
- 2026-11-17T18:15:23Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The current board confirms the Pixel 8 emulator QA was completed, with screenshots attached. The two fixes and regression tests are in the branch history, and the existing report draft records the device pass and remaining gap. `REPOOS_CHE… · stderr: (empty)
- 2026-11-17T18:17:51Z · note: handoff requested (cli)
- 2026-11-17T18:18:42Z · status active→review
- 2026-11-17T18:18:43Z · message_queued at 2026-11-17T18:18:43.128Z
- 2026-11-17T18:18:43Z · note: shots: skipped — the diff (8 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-17T18:24:30Z · note: review pass 1: needs some work
- 2026-11-17T18:24:30Z · status review→active
- 2026-11-17T18:24:33Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-17T18:29:45Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
