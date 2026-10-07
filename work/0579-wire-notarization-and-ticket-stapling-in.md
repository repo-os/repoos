---
id: "0579"
title: Wire notarization and ticket stapling into the RepoOS Hub release workflow
type: feature
status: ready
needs_input: true
needs_input_reason: needs-human-step
needs_input_detail: "Acceptance criteria mention a real device, physical hardware, accounts, credentials, or third-party registration — split that verification into a separate human-only task. (matched: credentials or keys)"
priority: p1
area: macos
story: MacOS Native App
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-28T18:43:47Z"
updated_at: "2026-10-06T23:48:11Z"
---
After the app is Developer ID–signed (#0578), submit it to Apple's notary service, wait for approval, and staple the ticket to the DMG before uploading the release asset. This removes the Gatekeeper warning on first launch.

## Problem

`.github/workflows/macos-hub.yml` builds the release app ad-hoc signed (`CODE_SIGN_IDENTITY="-"`), packages it into `RepoOSHub.dmg`, and uploads that DMG straight to the GitHub Release. Even after Developer ID signing lands (#0578), a signed-but-un-notarized artifact still fails Gatekeeper's trust check on first launch: macOS quarantines the downloaded DMG and shows the "developer cannot be verified" warning. Developer ID signing proves who built the app; notarization is Apple's automated scan on top of that, and stapling is what makes the resulting ticket travel with the file so verification also succeeds on a Mac that is offline at first launch.

So the story's headline outcome — "install without a Gatekeeper warning" — is unreachable until this task wires notarization and stapling into the release job. It also blocks the documentation fix: `docs/macos-hub-release.md` still says "The DMG is currently ad-hoc signed and not notarized" and calls the Gatekeeper warning "currently expected", and those statements must stop being written the moment this lands.

## Desired UX

This task has no end-user UI; there is no screen to change, and that is stated here so the section is not left blank. The experience is split between the person installing the app and the maintainer running a release:

- **End user:** downloads `RepoOSHub.dmg` from the GitHub Release, drags `RepoOS Hub.app` to Applications, and launches it with no Gatekeeper prompt — including on a Mac that is offline at first launch, because the stapled ticket makes verification local.
- **Maintainer:** pushes a version tag (or runs the workflow manually with `release_tag`). The release job signs, notarizes, staples, verifies, and uploads the DMG with no manual Keychain, portal, or `notarytool` step, and a rejected submission fails the job with Apple's reason visible in the log — never a silent pass-through of an unnotarized DMG.

## Acceptance criteria

- [ ] The `release` job in `.github/workflows/macos-hub.yml` submits the signed DMG with `xcrun notarytool submit`, using the credential set chosen in #0576, with `--wait` and `--timeout 1800`.
- [ ] On rejection or timeout the job fails and surfaces `xcrun notarytool log <submission-id>` output (the rejection reason) in the CI log; the submission id is captured from the submit call rather than guessed.
- [ ] After a successful submission, `xcrun stapler staple RepoOSHub.dmg` runs and `xcrun stapler validate RepoOSHub.dmg` passes.
- [ ] `spctl --assess --type open --context context:primary-signature RepoOSHub.dmg` exits 0 as an explicit release gate.
- [ ] The GitHub Release upload step attaches the stapled DMG; the notarize/staple/verify steps run before upload and no step uploads a pre-notarization copy.
- [ ] A non-publishing dry run (feature-branch tag or `workflow_dispatch` against a test tag) exercises the full submit → staple → verify path, or the steps are visibly gated on the #0576 secrets being configured.
- [ ] `docs/macos-hub-release.md` drops the "ad-hoc signed and not notarized" and "Gatekeeper warning is expected" lines, describes the automated `notarytool` + `stapler` steps, and its release checklist includes a notarization confirmation.
- [ ] No secret (password, API key, certificate material) is echoed to the log or committed to the repo.
- [ ] `repoos check` passes.

## Notes for AI

- This task is one slice of the story "MacOS Native App". It builds on #0576 (secret names: `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, optionally `APPLE_API_KEY` / `APPLE_API_KEY_ID` / `APPLE_API_ISSUER_ID`), #0577 (hardened runtime + entitlements), and #0578 (Developer ID signing of the `.app` and the DMG). Consume those outputs; do not reimplement provisioning or signing here.
- Use whichever notarization credential #0576 actually provisioned. If an API key was chosen, submit with `--key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY_ID" --issuer "$APPLE_API_ISSUER_ID"`; otherwise use the app-specific-password flags. Document the variant in use and note the alternative briefly rather than leaving it ambiguous.
- The notarized artifact is the DMG, not `RepoOS Hub.app`. `xcrun notarytool submit RepoOSHub.dmg` notarizes the signed app it contains; do not add a separate `.app` submission. The DMG must already be Developer ID–signed by #0578, or notarization will reject it.
- `notarytool` is available on the `macos-latest` runner. Run these steps in the existing `release` job, after "Package DMG" / "Verify DMG install experience" and before "Upload DMG to GitHub Release".
- Capture the submission id with `--output-format json` (use `tee` and parse the `id` field; `jq` exists on `macos-latest`). On failure run `xcrun notarytool log "$ID"` with the same credentials so the reason is in the log, then exit non-zero. `set -o pipefail` matters: a piped `notarytool` failure must fail the step.
- Typical turnaround is 2–5 minutes; `--timeout 1800` is the safety margin for slow Apple infrastructure. `stapler` can fail transiently; treat any failure as fatal — no `|| true`.
- Keep the DMG asset name `RepoOSHub.dmg` consistent with the rest of the workflow and docs (`RepoOS Hub.app` is the bundle; `RepoOSHub.dmg` is the asset).
- Documentation is part of the deliverable. Edit `docs/macos-hub-release.md`: the artifact-contract bullet at ~line 23 and the failure-triage bullet at ~line 49 both assert ad-hoc/no-notarization; replace them and add a checklist item confirming the DMG was notarized and stapled before publishing. Do not claim a warning-free first launch until it is actually true.
- This repo has zero runtime dependencies; this change touches only the workflow and docs, so add none. There is no JS here, so no `bun`/test changes are expected.
- Do not commit `dist/`, certificate, or secret material.

## What to do

In `.github/workflows/macos-hub.yml`, after the signing step:

1. **Submit for notarization** using `xcrun notarytool submit` with the app-specific password or API key from #0576:
   ```
   xcrun notarytool submit RepoOSHub.dmg \
     --apple-id "$APPLE_ID" \
     --password "$APPLE_APP_SPECIFIC_PASSWORD" \
     --team-id "$APPLE_TEAM_ID" \
     --wait
   ```
   (or the API key variant if that was chosen during provisioning)

2. **Staple the ticket** to the DMG:
   ```
   xcrun stapler staple RepoOSHub.dmg
   ```

3. **Verify** the stapled DMG passes Gatekeeper assessment:
   ```
   spctl --assess --type open --context context:primary-signature RepoOSHub.dmg
   ```

4. Upload the stapled DMG as the release asset (this replaces the existing upload step).

### Documentation

- Update `docs/macos-hub-release.md`:
  - Remove "The DMG is currently ad-hoc signed and not notarized" and the "Gatekeeper warning is expected" lines.
  - Add a note that notarization is automated and describe the `notarytool` + `stapler` steps.
- Update the release checklist in that doc to include a notarization confirmation step.

## Dependencies

- Requires #0576 (secrets), #0577 (entitlements), and #0578 (signing).

## Activity

- 2026-09-28T18:43:47Z · created · unknown
- 2026-09-28T18:45:04Z · story
- 2026-09-29T20:42:42Z · status inbox→ready
- 2026-10-05T11:15:31Z · needs_input
- 2026-10-05T15:49:48Z · needs_input
- 2026-10-05T15:55:09Z · body
- 2026-10-06T23:48:11Z · needs_input
