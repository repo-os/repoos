---
id: "0487"
title: Fix macOS Hub release DMG bundle-name mismatch
type: bug
status: done
priority: p1
area: macos
assigned_to: ai
created_by: ""
branch: feat/fix-macos-hub-release-dmg-bundle-name-mi
created_at: "2026-09-22T16:44:33Z"
updated_at: "2026-09-22T17:24:52Z"
---
Fix the macOS Hub release workflow before the first DMG release.

The Xcode project builds the application bundle as RepoOS.app (PRODUCT_NAME = RepoOS), but .github/workflows/macos-hub.yml currently searches for RepoOSHub.app when packaging the release DMG. The find command therefore returns no bundle and the subsequent copy step fails.

Acceptance criteria:
- The release workflow locates the actual built application bundle deterministically.
- The staged DMG contains the intended user-facing app bundle name, consistent with user documentation and the release artifact name.
- Add a small verification step that fails with a clear message if the expected bundle is absent before packaging.
- Verify the release build and DMG packaging commands locally or in a macOS CI-equivalent environment.
- Do not change Hub functionality, signing/notarization policy, or unrelated documentation.

## Activity

- 2026-09-22T16:44:33Z · created · unknown
- 2026-09-22T16:45:51Z · status inbox→ready
- 2026-09-22T16:45:53Z · status ready→active, branch
- 2026-09-22T16:47:52Z · status active→review
- 2026-09-22T17:24:52Z · status review→done, release:success
