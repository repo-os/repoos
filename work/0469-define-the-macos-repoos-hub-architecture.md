---
id: "0469"
title: Define the macOS RepoOS Hub architecture and security contract
type: feature
status: active
priority: p1
area: desktop
assigned_to: ai
created_by: ""
branch: feat/define-the-macos-repoos-hub-architecture
created_at: "2026-09-21T11:50:23Z"
updated_at: "2026-09-21T12:07:18Z"
---
Create the implementation-ready architecture for a native macOS wrapper that connects to multiple local and remote RepoOS servers. Decide and document the application boundary: a native SwiftUI shell, the selected server’s ordinary RepoOS web UI in WebKit, and a local-only registry of user-added servers.

Acceptance criteria:
- An ADR/design document selects the UI/runtime approach and explains why it is appropriate for a macOS-first app.
- Specifies the server registry schema, URL normalization, HTTPS-only policy, and /api/health reachability contract.
- Defines the navigation model: sidebar-first server workspace, optional pinned task contexts, and Cmd-K switching.
- Defines a strict WebKit trust boundary: loaded server content gets no native bridge, shell/file/Keychain access, or privileged injected scripts.
- Covers cookie/session isolation, navigation allow/deny rules, external-link behavior, OAuth/SSO limitations, and failure/offline states.
- Defines the v1/v2 boundary: v1 health and switching only; authenticated aggregate status requires an explicit server-issued, revocable Hub capability.
- Identifies the macOS build, signing, test, and release assumptions without changing core RepoOS runtime dependencies.

This is a design/ADR task. Do not scaffold the app yet.

## Activity

- 2026-09-21T11:50:23Z · created · unknown
- 2026-09-21T11:52:33Z · body
- 2026-09-21T12:06:53Z · status inbox→ready
- 2026-09-21T12:07:18Z · status ready→active, branch
