---
id: "0576"
title: Provision Developer ID certificate and store CI secrets for macOS Hub signing
type: feature
status: ready
priority: p1
area: macos
story: MacOS Native App
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-28T18:42:44Z"
updated_at: "2026-10-05T15:51:55Z"
---
Now that RepoOS has joined the Apple Developer Program, set up the one-time credential provisioning needed for automated Developer ID signing and notarization of RepoOS Hub.

## Problem

RepoOS Hub currently ships ad-hoc signed and un-notarized, so every first launch shows a Gatekeeper warning. The signing pipeline the rest of this story depends on — hardened runtime (#0577), Developer ID signing (#0578), and notarization/stapling (#0579) — cannot be built, run, or verified in CI until a Developer ID Application identity and notarization credentials exist as repository secrets. That provisioning is human-only: it needs the Apple Developer portal and a maintainer-controlled private key, so it must be done once, deliberately, before any of the code-side tasks can be tested end to end.

## Desired UX

This task has no end-user UI; there is no screen to change, and that is stated here so the section is not left blank. The user-visible outcome arrives indirectly: once this provisioning and its dependent tasks land, a Mac user opens the DMG and launches RepoOS Hub with no Gatekeeper warning. For the maintainer, the desired experience is that the credentials already exist as GitHub Actions repository secrets with documented names, so the release workflow needs no per-release Keychain or portal steps, and rotating an expiring certificate or password means following a short written runbook in `docs/macos-hub-release.md`.

## Acceptance criteria

- A Developer ID Application certificate and private key exist and can be exported as a `.p12`; the certificate is visible under the team's Apple Developer account.
- A notarization credential exists: either an App Store Connect API key (`APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER_ID`) or an Apple ID plus app-specific password (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`).
- The GitHub Actions repository secrets are set using the documented names: `MACOS_CERTIFICATE` (base64-encoded `.p12`), `MACOS_CERTIFICATE_PASSWORD`, and `APPLE_TEAM_ID`, plus the notarization credential set chosen above.
- `docs/macos-hub-release.md` documents each secret's purpose and gives step-by-step rotation instructions (new certificate, new password/API key, update the secret, re-verify).
- No certificate material, `.p12`, password, or API key is committed anywhere in the repo.
- The dependent tasks (#0577, #0578, #0579) can reference the secrets by name.

## What to do

1. In Xcode / Apple Developer portal, generate or export a Developer ID Application certificate and its private key as a `.p12` file.
2. Create an App Store Connect API key (or an app-specific password for `notarytool`) for automated notarization submissions.
3. Store as GitHub Actions repository secrets:
   - `MACOS_CERTIFICATE` — base64-encoded `.p12`
   - `MACOS_CERTIFICATE_PASSWORD` — `.p12` export password
   - `APPLE_ID` — Apple ID email used for notarization
   - `APPLE_APP_SPECIFIC_PASSWORD` — app-specific password (or store the API key variant as `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER_ID`)
   - `APPLE_TEAM_ID` — 10-character team identifier
4. Document the secret names and rotation instructions in `docs/macos-hub-release.md`.
5. Do NOT commit any certificate material or passwords to the repo.

## Notes for AI

- The credential export and secret upload steps are human-only. An agent's job in this task is to update `docs/macos-hub-release.md`; if the secrets have not been uploaded yet, that is blocking human input, not something the agent can complete by itself. Do not fabricate certificate material or invent secret values.
- `APPLE_TEAM_ID` can be found in the Apple Developer portal under Membership.
- The CI workflow `.github/workflows/macos-hub.yml` is updated by subsequent tasks — this task is purely provisioning and should not modify it.
- Prefer the app-specific password flow unless an App Store Connect API key is already in hand; document whichever variant is actually in use, and note the alternative briefly rather than leaving ambiguity.
- Rotating a Developer ID certificate does not invalidate already-notarized releases. Rotate before expiry and re-run a dry-run signing build to confirm the new secret works.
- Keep the rotation instructions concrete enough that a future maintainer can follow them without re-deriving the portal steps.

## Activity

- 2026-09-28T18:42:44Z · created · unknown
- 2026-09-28T18:42:53Z · body
- 2026-09-29T20:42:34Z · status inbox→ready
- 2026-10-05T11:15:31Z · needs_input
- 2026-10-05T15:49:33Z · story
- 2026-10-05T15:49:37Z · needs_input
- 2026-10-05T15:51:45Z · body
