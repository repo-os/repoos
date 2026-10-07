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
updated_at: "2026-10-07T18:05:22Z"
---
Document the credentials and rotation runbook required for automated Developer ID signing and notarization of RepoOS Hub. An authorized maintainer performs the Apple Developer account and GitHub secret setup separately; this task's agent deliverable is the repository documentation and must not depend on access to, or claims about, those external account/device outcomes.

## Problem

RepoOS Hub's release pipeline needs a Developer ID Application identity and notarization credentials before signing, notarization, and stapling can run in CI. Creating/exporting the certificate requires a maintainer-controlled private key and Apple Developer account access; adding repository secrets requires GitHub administration access. An agent cannot safely or reliably perform or attest to those human-only actions. The repository therefore needs a concrete, secret-free runbook that tells an authorized maintainer what credentials to create, which exact secret names downstream workflow tasks consume, and how to rotate them. Actual account provisioning and successful credential use are external follow-up operations, not evidence an agent is expected to manufacture or verify in this task.

## Desired UX

There is no UI change; maintainers can follow the runbook to provision and rotate signing credentials without per-release portal or Keychain work.

## Acceptance criteria

- [ ] `docs/macos-hub-release.md` describes the purpose and expected format of `MACOS_CERTIFICATE` (base64-encoded password-protected `.p12` containing the certificate and private key), `MACOS_CERTIFICATE_PASSWORD`, and `APPLE_TEAM_ID` (the 10-character team identifier).
- [ ] The runbook documents both supported notarization credential sets with exact names: `APPLE_ID` plus `APPLE_APP_SPECIFIC_PASSWORD`, or `APPLE_API_KEY`, `APPLE_API_KEY_ID`, and `APPLE_API_ISSUER_ID`. It recommends the app-specific-password path unless an API key is already available and explains how to avoid leaving the documented choice ambiguous when provisioning is performed.
- [ ] The runbook gives concrete Apple portal/Keychain and GitHub repository Actions-secret setup steps, and separate certificate and notarization-credential rotation procedures, including update order, re-verification, and secure cleanup of temporary files. It notes that rotation does not invalidate already-notarized releases and advises rotating before expiry.
- [ ] Secret names and data formats in the runbook agree with the contracts consumed by #0577, #0578, and #0579; any `.p8` file for the API-key path is materialized at runtime rather than provisioned as an additional path secret.
- [ ] Documentation contains no credential values or certificate/key material. The change does not alter `.github/workflows/macos-hub.yml` or Xcode signing settings.
- [ ] The task's completion is judged only by the repository documentation and its consistency with the named secret contract. It does not require an agent to access or inspect an Apple account, create/export a certificate, write/read GitHub secrets, run a credential-backed signing/notarization job, or attest that those external steps succeeded.

## What to do

1. Update `docs/macos-hub-release.md` with the secret contract and the human-facing provisioning and rotation runbook described above.
2. Explain how a maintainer creates a Developer ID Application certificate using a maintainer-controlled key/CSR, imports the certificate and private key into Keychain Access, exports a password-protected `.p12`, and base64-encodes that export as a single line for `MACOS_CERTIFICATE`.
3. Explain how to create either an Apple ID app-specific password or an App Store Connect API key for `notarytool`; include the shared `APPLE_TEAM_ID` lookup and the exact destination in GitHub Settings → Secrets and variables → Actions.
4. Include a safe rotation procedure: create replacement credentials before revoking old credentials where overlap is supported, update related secrets, perform a non-publishing verification when the dependent workflow is available, then revoke superseded credentials and remove local temporary files securely.
5. Keep this change to documentation. Do not attempt account provisioning or credential-backed CI verification as part of the agent's acceptance evidence.

## Notes for AI

- Apple Developer portal access, private-key export, notarization credential creation, and GitHub repository secret writes are human-only. Do not fabricate credentials, attempt to retrieve secret values, or imply those actions occurred. This task's acceptance criteria deliberately cover documentation only; their success does not mean that repository secrets have been provisioned.
- Never ask a maintainer to paste a certificate, private key, password, API key, or base64 credential into chat, a task, a commit, or a log. Document names, formats, and procedures only.
- `APPLE_TEAM_ID` is found in Apple Developer account Membership details. `MACOS_CERTIFICATE` must represent the export containing the matching private key, not merely a public `.cer` certificate.
- Unless an App Store Connect API key is already available, recommend `APPLE_ID` and `APPLE_APP_SPECIFIC_PASSWORD`. For the API-key option, document `APPLE_API_KEY`, `APPLE_API_KEY_ID`, and `APPLE_API_ISSUER_ID`; the workflow creates and cleans up any temporary `.p8` file, and no `APPLE_API_KEY_PATH` secret is required.
- Do not modify `.github/workflows/macos-hub.yml` or Xcode settings; implementation belongs to #0577–#0579. Do not mark the human's provisioning, account state, or CI verification complete based on this documentation change.
- A maintainer can verify the external setup after this task by checking secret names (not values) in GitHub and running the non-publishing workflow once the dependent tasks are available. Rotating a certificate does not invalidate already-notarized releases.

## Activity

- 2026-09-28T18:42:44Z · created · unknown
- 2026-09-28T18:42:53Z · body
- 2026-09-29T20:42:34Z · status inbox→ready
- 2026-10-05T11:15:31Z · needs_input
- 2026-10-05T15:49:33Z · story
- 2026-10-05T15:49:37Z · needs_input
- 2026-10-05T15:51:45Z · body
- 2026-10-06T23:48:11Z · needs_input
- 2026-10-07T14:00:06Z · needs_input
- 2026-10-07T14:01:20Z · body
- 2026-10-07T15:47:01Z · needs_input
- 2026-10-07T16:39:33Z · needs_input
- 2026-10-07T16:43:10Z · needs_input
- 2026-10-07T17:05:05Z · needs_input
- 2026-10-07T17:07:38Z · needs_input
- 2026-10-07T18:04:55Z · needs_input
- 2026-10-07T18:05:22Z · body
