---
id: "1159"
title: "QA pass: use the Android Hub app on the phone, find broken things and fix them"
type: bug
status: ready
priority: p1
area: mobile
assigned_to: ai
created_by: t@t
branch: ""
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-17T15:51:18Z"
updated_at: "2026-11-17T15:51:38Z"
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

Use just deploy-phone only if the saved port works; otherwise do not ask Nick for secrets. Do not edit repoos.toml.

## Activity

- 2026-11-17T15:51:18Z · created · t@t
- 2026-11-17T15:51:34Z · cli_override, model_override
- 2026-11-17T15:51:38Z · status inbox→ready
