---
id: "0579"
title: Wire notarization and ticket stapling into the RepoOS Hub release workflow
type: feature
status: ready
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Problem, Desired UX, Acceptance criteria, Notes for AI"
priority: p1
area: macos
story: MacOS Native App
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-28T18:43:47Z"
updated_at: "2026-10-05T11:15:31Z"
---
After the app is Developer ID–signed (#0578), submit it to Apple's notary service, wait for approval, and staple the ticket to the DMG before uploading the release asset. This removes the Gatekeeper warning on first launch.

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

## Notes

- `notarytool submit --wait` polls until Apple approves or rejects; typical turnaround is 2–5 minutes. The step can time out on slow Apple infrastructure — add `--timeout 1800` as a safety margin.
- If notarization fails, `xcrun notarytool log <submission-id>` retrieves the rejection reason; surface this in the CI output.
- The notarized artifact is the DMG (not the .app), since the DMG is the user-facing deliverable.

## Activity

- 2026-09-28T18:43:47Z · created · unknown
- 2026-09-28T18:45:04Z · story
- 2026-09-29T20:42:42Z · status inbox→ready
- 2026-10-05T11:15:31Z · needs_input
