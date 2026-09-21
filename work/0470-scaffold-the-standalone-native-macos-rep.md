---
id: "0470"
title: Scaffold the standalone native macOS RepoOS Hub project
type: feature
status: inbox
priority: p1
area: desktop
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-21T11:50:24Z"
updated_at: "2026-09-21T11:52:34Z"
---
After the macOS Hub architecture/security contract is approved, add a standalone macOS application project as a sibling to mobile/, without adding runtime dependencies to the core repoos package.

Acceptance criteria:
- A minimal SwiftUI macOS app builds reproducibly on supported Xcode/macOS tooling.
- It has an app identity, development signing guidance, a basic window, lifecycle entry point, and a documented local build/test command.
- The project boundary is explicit: native shell code lives under macos/ and core RepoOS server/web builds remain independent.
- CI or a documented macOS build verification path catches compile regressions.
- The app renders a harmless placeholder workspace with no remote web content or native bridge exposed.
- Add developer documentation explaining how to run the app from a checkout.

Follow the approved architecture task. Keep this foundation small; server registry and WebKit loading are separate follow-up tasks.

## Activity

- 2026-09-21T11:50:24Z · created · unknown
- 2026-09-21T11:52:34Z · body
