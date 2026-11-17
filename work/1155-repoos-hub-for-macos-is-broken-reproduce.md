---
id: "1155"
title: "RepoOS Hub for macOS is broken: reproduce, diagnose and fix, then test on a real build"
type: bug
status: review
priority: p1
area: macos
assigned_to: ai
created_by: t@t
branch: feat/repoos-hub-for-macos-is-broken-reproduce
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-17T14:36:24Z"
updated_at: "2026-11-17T15:19:03Z"
review_rounds: 1
review_passes: 1
---
## Problem

Nick reports that the native RepoOS Hub app on macOS (macos/RepoOSHub, Xcode project macos/RepoOSHub.xcodeproj, a Mac companion that connects to RepoOS servers) is 'totally broken' right now. We do not yet know the exact symptom (crash on launch, blank window, cannot connect to servers, cannot add a server, signing/Gatekeeper problem, or something else). The Hub web and Android apps have changed a lot recently (server picker, tailnet discovery, HTTPS-only saving, auth), and the macOS app may have drifted from the server API or the shared behavior.

## Desired UX

Launching the Mac app shows the server list; saved servers show Reachable/Unreachable correctly; adding a server by URL works; opening a server shows the RepoOS UI; the app does not crash or hang.

## Acceptance criteria

- [ ] The failure is reproduced first by building and launching the current macos/RepoOSHub scheme with xcodebuild on this Mac, and the exact symptom, error text and crash log are recorded in the engineering report.
- [ ] The root cause is identified (for example API contract drift, auth, a changed endpoint such as /api/servers/tailnet, a build break, a missing entitlement, an outdated server URL assumption) and fixed in the macOS app or server, with the smallest change that works.
- [ ] The macOS unit tests (macos/RepoOSHubTests) pass, and a new test covers the cause found.
- [ ] After the fix, the app is built, launched and exercised: add a server by URL, see it Reachable, open it, and quit and relaunch with the server still saved. The steps and result are recorded. If anything needs Nick's Mac, login or a signing identity, the task says exactly what and stops at a clear hand-off rather than guessing.
- [ ] No code signing identity, certificate or secret is created or committed; the Developer ID / notarization work (#0576, #0579) is separate and untouched.

## Notes for AI

Read macos/README.md and the 'RepoOS Hub for macOS' section of README.md first. Do not edit repoos.toml. If the app cannot be launched headlessly in this environment, build it, run the unit tests, and write precise manual steps for Nick instead of claiming it works.

## Screenshots

![Nick's screenshot of the broken macOS Hub: light sidebar on a dark window, server names invisible except the selected row](/api/tasks/1155/attachments/att_7383208d-4f73-4967-9355-0e0d11482757.webp)

## Activity

- 2026-11-17T14:36:24Z · created · t@t
- 2026-11-17T14:36:27Z · cli_override, model_override
- 2026-11-17T14:36:29Z · status inbox→ready
- 2026-11-17T14:36:30Z · status ready→active, branch
- 2026-11-17T14:38:47Z · screenshots
- 2026-11-17T14:38:48Z · message_queued at 2026-11-17T14:38:48.217Z
- 2026-11-17T14:39:19Z · message_queued at 2026-11-17T14:39:19.423Z
- 2026-11-17T14:39:36Z · message_queued at 2026-11-17T14:39:36.761Z
- 2026-11-17T14:40:38Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-17T14:40:47Z · message_queued at 2026-11-17T14:40:47.693Z
- 2026-11-17T14:41:54Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-17T14:41:54Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: After isolating scan tests from the live registry, the full macOS unit-test suite passes. The fixture also now asserts that a populated registry does not invoke fallback scanning, which is the behavior that caused the original machine-depe… · stderr: Reading additional input from stdin...
- 2026-11-17T14:41:54Z · message_delivered: 4 message(s)
- 2026-11-17T14:55:42Z · body
- 2026-11-17T14:58:41Z · status active→review
- 2026-11-17T14:58:41Z · message_queued at 2026-11-17T14:58:41.855Z
- 2026-11-17T14:58:41Z · note: shots: skipped — the diff (10 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-17T15:07:52Z · note: review pass 1: needs some work
- 2026-11-17T15:07:52Z · message_delivered: 1 message(s)
- 2026-11-17T15:07:52Z · status review→active
- 2026-11-17T15:16:52Z · body
- 2026-11-17T15:19:03Z · status active→review
- 2026-11-17T15:19:03Z · message_queued at 2026-11-17T15:19:03.237Z
- 2026-11-17T15:19:03Z · note: shots: skipped — the diff (12 changed paths) touches no capture target's globs — no UI change to capture
