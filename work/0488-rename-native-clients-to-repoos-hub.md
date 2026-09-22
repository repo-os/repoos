---
id: "0488"
title: Rename native clients to RepoOS Hub
type: feature
status: review
priority: p1
area: macos
assigned_to: ai
created_by: ""
branch: feat/rename-native-clients-to-repoos-hub
created_at: "2026-09-22T16:53:51Z"
updated_at: "2026-09-22T17:01:27Z"
---
Rename the user-facing native client product to “RepoOS Hub” on macOS, iOS, and Android.

Use “RepoOS Hub” in app labels, window/application display names, Capacitor metadata, native mobile shell branding, titles, and user-facing documentation. Keep technical identifiers stable unless a platform requires otherwise: bundle/application IDs, Xcode project/scheme/module names, filesystem source paths, and the RepoOSHub.dmg artifact filename remain identifiers rather than product typography.

Acceptance criteria:
- macOS builds a user-visible RepoOS Hub.app and displays RepoOS Hub in its Info.plist/window metadata; update test-host paths accordingly.
- iOS display name and Android launcher/activity labels are RepoOS Hub.
- Capacitor appName, mobile HTML title, and visible native-shell brand/lock copy use RepoOS Hub.
- README and user-facing installation examples use RepoOS Hub.app and RepoOS Hub consistently.
- Documentation distinguishes an individual RepoOS server from the multi-server RepoOS Hub client.
- Do not rename org.repoos.hub, org.repoos.mobile, project/scheme/module identifiers, source directories, or release artifact identifiers.
- Run the macOS native build/test and the mobile build applicable to the changed metadata.

Coordinate with #0487: the release workflow must package the newly named RepoOS Hub.app bundle while retaining RepoOSHub.dmg as the downloadable artifact.

## Activity

- 2026-09-22T16:53:51Z · created · unknown
- 2026-09-22T16:54:05Z · branch
- 2026-09-22T16:54:06Z · status inbox→active
- 2026-09-22T17:01:27Z · watchdog: auto-surfaced stuck task · status active→review · agent never started — no session exists for this task · next step: resume the session manually from the task's worktree and check for uncommitted work
