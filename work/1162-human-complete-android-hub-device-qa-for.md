---
id: "1162"
title: "Human: complete Android Hub device QA for #1159"
type: chore
status: inbox
hold: true
hold_reason: "Waiting for a reachable trusted RepoOS server to verify tailnet discovery for #1159"
hold_at: "2026-11-17T18:06:47.402Z"
priority: p1
area: mobile
assigned_to: human
created_by: t@t
branch: ""
created_at: "2026-11-17T17:33:14Z"
updated_at: "2026-11-17T18:06:47Z"
---
## Purpose
Complete the remaining live tailnet discovery check for #1159 using an available Android phone or emulator and a reachable trusted RepoOS server. The saved wireless ADB target refused connection on 2026-11-18; a Pixel 8 Android 16 emulator has since been used for the native UI pass, but the attempted dev.repoos.org endpoint was unreachable, so discovery results remain unverified.

## Step-by-step guide
1. When a reachable trusted RepoOS server is available to the Hub app, use an Android phone or emulator with ADB. Use only the RepoOS Hub Dev variant (org.repoos.mobile.dev); do not install production builds.\n2. From the #1159 worktree, connect to the saved ADB target if available, or use the supplied emulator. Do not ask for or paste secrets into chat or task files. Use just deploy-phone only when the saved port works.\n3. Open Find servers on my tailnet and verify the actual discovery response from the trusted server. Capture the Hub screen with adb exec-out screencap -p and inspect it. Record whether rows appear and whether selecting one works.\n4. Attach the screenshot with repoos update <id> --screenshot <path> --caption "..." and send the result to #1159. Do not claim a discovery result without screenshot evidence.\n5. If other native screens need rechecking after the server is available, use the #1159 checklist and attach screenshots for each claimed screen.

## Completion

Unhold and start this task only after a phone or emulator is available. Report the actual device used and the screenshots captured. No device results are claimed yet.

## Human task

_Assigned to a human, not an AI agent. No `## Notes for AI` is required here; the acceptance criteria are the human's checklist._

## Activity

- 2026-11-17T17:33:14Z · created · t@t
- 2026-11-17T17:33:52Z · depends_on
- 2026-11-17T18:06:44Z · body: Purpose (added 1, removed 1)
- 2026-11-17T18:06:46Z · body: Step-by-step guide (added 1, removed 6)
- 2026-11-17T18:06:47Z · held-reason, held-at
