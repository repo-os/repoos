---
id: "1162"
title: "Human: complete Android Hub device QA for #1159"
type: chore
status: inbox
hold: true
priority: p1
area: mobile
assigned_to: human
created_by: t@t
branch: ""
created_at: "2026-11-17T17:33:14Z"
updated_at: "2026-11-17T17:33:52Z"
---
## Purpose

Complete the native Android device QA that #1159 cannot perform without an available phone or emulator. The saved wireless ADB target refused the connection on 2026-11-18, and no emulator was available. This task is held until a device is available.

## Step-by-step guide

1. Provide an Android phone or emulator with ADB available. Install and use only the RepoOS Hub Dev variant (`org.repoos.mobile.dev`). Do not install a production build.
2. From the #1159 worktree, connect with the saved ADB target if it is available, or use the supplied emulator. Do not ask for or paste secrets into chat or task files. Use `just deploy-phone` only when the saved port works.
3. Drive the app through the server picker, Add server, edit/remove, tailnet discovery, Settings, light and dark themes, opening a server, the lock screen, returning to the picker, and the system back gesture.
4. For each screen/state, capture only the phone or emulator display using `adb exec-out screencap -p > <screenshot-path>`. Inspect every captured image yourself.
5. Record any overlap, clipping, color or text readability issue, broken navigation, crash, or relevant logcat error. Attach screenshots of defects to this task with `repoos update <id> --screenshot <path> --caption "..."`.
6. Send the checked-screen list, observed defects, and screenshot paths to #1159. Do not claim screens that lack a screenshot. If a defect needs a code fix, include reproducible steps and its screenshot so the engineer can handle it.

## Completion

Unhold and start this task only after a phone or emulator is available. Report the actual device used and the screenshots captured. No device results are claimed yet.

## Human task

_Assigned to a human, not an AI agent. No `## Notes for AI` is required here; the acceptance criteria are the human's checklist._

## Activity

- 2026-11-17T17:33:14Z · created · t@t
- 2026-11-17T17:33:52Z · depends_on
