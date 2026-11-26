---
id: "1292"
title: "Human: add Apple signing and notarization secrets for RepoOS Hub"
type: chore
status: inbox
priority: p2
area: macos
story: MacOS Native App
assigned_to: human
created_by: t@t
branch: ""
created_at: "2026-11-26T16:27:28Z"
updated_at: "2026-11-26T16:27:28Z"
---
## Problem

The macOS Hub release job fails at "Notarize, staple and verify DMG" because GitHub has no Apple credentials, so `RepoOSHub.dmg` is not attached to releases (seen on the v0.5.94 run). #0576 wrote the setup instructions only; the secrets still have to be created by an authorized maintainer.

Secrets alone are not expected to produce a working DMG: the release workflow does not yet sign the app with a Developer ID certificate. That work is #0577 and #0578, and Apple normally rejects an unsigned app at notarization.

## Step-by-step guide

The full instructions are in `docs/macos-hub-release.md`, under "Signing and notarization credentials". Never paste a secret value into a task, chat, commit or log.

1. Confirm you have Apple Developer Program access with the Account Holder role, and admin access to the repo-os/repoos repository.
2. Follow "Provision the Developer ID certificate" to create the certificate and export it as a password-protected `.p12`.
3. In GitHub, open Settings → Secrets and variables → Actions and add `MACOS_CERTIFICATE`, `MACOS_CERTIFICATE_PASSWORD` and `APPLE_TEAM_ID`.
4. Follow "Provision notarization credentials". Use the recommended path and add `APPLE_ID` and `APPLE_APP_SPECIFIC_PASSWORD`. Only if you already have an App Store Connect API key, add `APPLE_API_KEY`, `APPLE_API_KEY_ID` and `APPLE_API_ISSUER_ID` instead. Never set both.
5. Record which path you chose in this task (not the values).
6. Follow "Secure cleanup of temporary files".
7. After #0577 and #0578 have landed, run the macOS Hub workflow on an existing tag with `dry_run` enabled and confirm notarization, stapling and verification pass.
8. Run it again without `dry_run` and confirm `RepoOSHub.dmg` is attached to the release.

## Acceptance criteria

- The signing secrets and exactly one notarization set exist in repository Actions secrets.
- The chosen notarization path is recorded here, without values.
- A dry run passes after #0577 and #0578 have landed.
- `RepoOSHub.dmg` is attached to a release and opens on a Mac without a developer-verification warning.

## Human task

_Assigned to a human, not an AI agent. No `## Notes for AI` is required here; the acceptance criteria are the human's checklist._

## Activity

- 2026-11-26T16:27:28Z · created · t@t
