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
updated_at: "2026-11-17T18:06:44Z"
---
## Purpose
Complete the remaining live tailnet discovery check for #1159 using an available Android phone or emulator and a reachable trusted RepoOS server. The saved wireless ADB target refused connection on 2026-11-18; a Pixel 8 Android 16 emulator has since been used for the native UI pass, but the attempted dev.repoos.org endpoint was unreachable, so discovery results remain unverified.

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
- 2026-11-17T18:06:44Z · body: Purpose (added 1, removed 1)
