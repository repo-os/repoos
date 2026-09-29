---
id: "0576"
title: Provision Developer ID certificate and store CI secrets for macOS Hub signing
type: feature
status: ready
priority: p1
area: macos
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-28T18:42:44Z"
updated_at: "2026-09-29T20:42:34Z"
---
Now that RepoOS has joined the Apple Developer Program, set up the one-time credential provisioning needed for automated Developer ID signing and notarization of RepoOS Hub.

## What to do

1. In Xcode / Apple Developer portal, generate or export a **Developer ID Application** certificate and its private key as a `.p12` file.
2. Create an **App Store Connect API key** (or an app-specific password for `notarytool`) for automated notarization submissions.
3. Store the following as GitHub Actions repository secrets:
   - `MACOS_CERTIFICATE` — base64-encoded `.p12`
   - `MACOS_CERTIFICATE_PASSWORD` — `.p12` export password
   - `APPLE_ID` — Apple ID email used for notarization
   - `APPLE_APP_SPECIFIC_PASSWORD` — app-specific password (or store API key variant as `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER_ID`)
   - `APPLE_TEAM_ID` — 10-character team identifier
4. Document the secret names and rotation instructions in `docs/macos-hub-release.md`.
5. Do NOT commit any certificate material or passwords to the repo.

## Notes

- This task is human-only for the credential export and secret upload steps; an agent can write the doc update.
- The CI workflow (`.github/workflows/macos-hub.yml`) is updated by subsequent tasks — this task is purely provisioning.
- `APPLE_TEAM_ID` can be found in the Apple Developer portal under Membership.

story: MacOS Native App

## Activity

- 2026-09-28T18:42:44Z · created · unknown
- 2026-09-28T18:42:53Z · body
- 2026-09-29T20:42:34Z · status inbox→ready
