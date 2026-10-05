---
id: "0578"
title: Wire Developer ID code-signing into the Xcode build and GitHub Actions CI
type: feature
status: inbox
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Problem, Acceptance criteria, Notes for AI"
priority: p1
area: macos
story: MacOS Native App
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-28T18:43:30Z"
updated_at: "2026-10-05T22:38:16Z"
---
Replace the current ad-hoc signing in the RepoOS Hub Xcode project and release CI with Developer ID signing using the certificate provisioned in #0576.

## What to do

### Xcode project
1. In the Hub target's Release build settings, set signing to **Developer ID Application** (the team and certificate from #0576).
2. Set `CODE_SIGN_STYLE = Manual` (or `Automatic` if the CI keychain approach handles it) — manual is more predictable in CI.
3. Ensure `DEVELOPMENT_TEAM` is set to the team ID.
4. Remove any ad-hoc signing overrides.

### CI workflow (`.github/workflows/macos-hub.yml`)
Add a signing step before the DMG packaging step:
1. Import the `MACOS_CERTIFICATE` secret into a temporary Keychain.
2. Build in Release with `CODE_SIGN_IDENTITY="Developer ID Application"` and `CODE_SIGN_STYLE=Manual`.
3. Sign the `.app` bundle with `codesign --deep --force --options runtime --entitlements macos/RepoOSHub/RepoOSHub.entitlements`.
4. Sign the DMG itself with `codesign --sign "Developer ID Application: ..."`.
5. Clean up the temporary Keychain in an `always()` post step.

### Verification
- `codesign --verify --deep --strict RepoOS\ Hub.app` must exit 0.
- `spctl --assess --type exec RepoOS\ Hub.app` must exit 0 (Gatekeeper acceptance).
- Run on a CI dry-run (push to a feature branch, not a tag) to confirm signing without triggering a release.

## Dependencies

- Requires #0576 (secrets) and #0577 (hardened runtime + entitlements).

## Notes

- The temporary Keychain pattern avoids polluting the runner's login keychain: `security create-keychain -p "" build.keychain`, import, set as default, then `security delete-keychain build.keychain` on cleanup.
- Update `docs/macos-hub-release.md` to describe the new signing step.

## Activity

- 2026-09-28T18:43:30Z · created · unknown
- 2026-09-28T18:45:04Z · story
- 2026-10-05T11:15:28Z · needs_input
