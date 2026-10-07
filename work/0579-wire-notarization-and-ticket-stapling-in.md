---
id: "0579"
title: Wire notarization and ticket stapling into the RepoOS Hub release workflow
type: feature
status: ready
priority: p1
area: macos
story: MacOS Native App
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-28T18:43:47Z"
updated_at: "2026-10-07T16:08:42Z"
---
After the release app and its DMG are signed as specified by #0578, the macOS Hub release job must submit the DMG to Apple's notary service, wait for approval, staple Apple's ticket to that same DMG, and verify the result before attaching it to a GitHub Release. This completes the distribution path needed for Gatekeeper to trust the downloaded artifact, including offline verification from the stapled ticket.

## Problem

Developer ID signing identifies the publisher but does not by itself establish Apple's notarization approval. An uploaded signed-but-unnotarized `RepoOSHub.dmg` can still trigger Gatekeeper's developer-verification warning when downloaded. The release workflow must not publish until notarization succeeds, the ticket is stapled, and the stapled DMG passes explicit validation. A rejected or timed-out submission must fail visibly with Apple's submission log, not silently fall through to upload. The release runbook must describe this real pipeline and stop describing the warning as expected.

## Desired UX

There is no UI change in this task: users receive a notarized, stapled DMG, while maintainers get an automated release gate with actionable Apple rejection details and no per-release portal or Keychain work.

## Acceptance criteria

- In `.github/workflows/macos-hub.yml`, the existing `release` job submits `RepoOSHub.dmg` after packaging and the DMG install-experience check, and before any release upload. It submits the signed DMG containing `RepoOS Hub.app`; do not submit the app separately or change the signing work owned by #0578.
- Use the notarization credential provisioned by #0576: prefer `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`; use `APPLE_API_KEY`, `APPLE_API_KEY_ID`, and `APPLE_API_ISSUER_ID` instead only if that is the credential set actually provisioned. Never hard-code or print secret values. Document the chosen variant and briefly identify the supported alternative in the runbook.
- Run `xcrun notarytool submit RepoOSHub.dmg` with `--wait`, `--timeout 1800`, and `--output-format json`. Capture the submission `id` from that command's JSON output and retain it for diagnostics; use `set -o pipefail` if piping through `tee` so a failed submission cannot be masked.
- A rejected submission or wait timeout fails the step/job. When an ID was returned, run `xcrun notarytool log "$ID"` using the same credential variant and include Apple's log output in CI; do not guess an ID. If submission fails before returning an ID, preserve the original nonzero failure and report that no submission ID was available. Never continue to stapling or upload after failure.
- Only after accepted notarization, run `xcrun stapler staple RepoOSHub.dmg`, then `xcrun stapler validate RepoOSHub.dmg`, and `spctl --assess --type open --context context:primary-signature RepoOSHub.dmg`. Each command is a fatal gate; do not suppress failures or upload a pre-stapling copy.
- The GitHub Release upload occurs only after all notarization and verification gates succeed and attaches that exact `RepoOSHub.dmg` file.
- Provide a non-publishing validation path (for example, an explicit `workflow_dispatch` dry-run input) that can exercise submission, stapling, and verification without creating or modifying a GitHub Release. It must not publish a test tag or bypass notarization. If required #0576 secrets are unavailable, fail clearly before upload; never treat missing credentials as permission to upload an unnotarized artifact. Make the dry-run behavior and any credential prerequisite visible in the workflow and logs.
- Update `docs/macos-hub-release.md` to remove claims that the DMG is ad-hoc signed/not notarized or that a Gatekeeper warning is expected. Describe the automated submit/wait, staple, and verification sequence and add a release-checklist item confirming successful notarization and stapling before publication.
- Do not commit, print, or expose passwords, API keys, certificates, or private-key material. Keep the release asset name `RepoOSHub.dmg` consistent.
- Run `repoos check` and resolve any failures caused by this change.

## Notes for AI

- This is the notarization/stapling slice of the “MacOS Native App” story. It depends on #0576 (human-provisioned secrets), #0577 (hardened runtime and entitlements), and #0578 (Developer ID signing of the app and DMG). Consume those outputs; do not reimplement credential provisioning, entitlements, or signing. Notarization cannot be meaningfully exercised until the prerequisite signing and credentials are available.
- #0576 prefers the app-specific-password credential flow unless an App Store Connect API key is already available. Confirm which secret set the workflow/runbook will use from that provisioning outcome rather than inventing values or leaving the chosen variant ambiguous.
- Keep all new steps in the existing `release` job, after `Package DMG` / `Verify DMG install experience` and before `Upload DMG to GitHub Release`. `notarytool` is available on `macos-latest`; `jq` is available there for extracting the JSON `id`. Capture the ID from the actual submission response, and use the same authentication options for `notarytool log`.
- Keep `--timeout 1800` as the wait limit. Treat stapler or verification failures as fatal; do not add success-shaped fallbacks such as `|| true`. Ensure error handling preserves the submission ID when `--wait` returns a failure so the Apple log can be fetched where possible.
- The current manual `workflow_dispatch` release path targets an existing tag and uploads to that release. A test must be genuinely non-publishing: add or use an explicit dry-run mode that runs the full notarization path but skips release creation/upload, rather than assuming a test tag is harmless.
- Scope documentation edits to `docs/macos-hub-release.md`. Do not claim a warning-free first launch unless the signed, notarized, stapled artifact and the stated gates are in place. This task has no UI, runtime dependency, certificate-file, or secret-value changes.

## Activity

- 2026-09-28T18:43:47Z · created · unknown
- 2026-09-28T18:45:04Z · story
- 2026-09-29T20:42:42Z · status inbox→ready
- 2026-10-05T11:15:31Z · needs_input
- 2026-10-05T15:49:48Z · needs_input
- 2026-10-05T15:55:09Z · body
- 2026-10-06T23:48:11Z · needs_input
- 2026-10-07T14:00:10Z · needs_input
- 2026-10-07T14:01:41Z · body
- 2026-10-07T15:47:01Z · needs_input
- 2026-10-07T16:08:42Z · needs_input
