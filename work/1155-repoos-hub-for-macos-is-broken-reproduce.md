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
updated_at: "2026-11-17T14:58:41Z"
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

## Activity

- 2026-11-17T14:36:24Z · created · t@t
- 2026-11-17T14:36:27Z · cli_override, model_override
- 2026-11-17T14:36:29Z · status inbox→ready
- 2026-11-17T14:36:30Z · status ready→active, branch
- 2026-11-17T14:58:41Z · status active→review
