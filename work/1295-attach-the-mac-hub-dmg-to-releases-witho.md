---
id: "1295"
title: Attach the Mac Hub DMG to releases without Apple notarization until credentials exist
type: bug
status: active
priority: p1
area: macos
story: MacOS Native App
assigned_to: ai
created_by: t@t
branch: feat/attach-the-mac-hub-dmg-to-releases-witho
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-28T00:00:35Z"
updated_at: "2026-11-28T00:04:17Z"
---
## Problem

The landing page and docs link to `releases/latest/download/RepoOSHub.dmg`, which returns 404. Releases up to v0.5.82 attached the DMG. Since then the workflow did not run on tags (the invalid workflow file fixed in #1291), and the notarization gate added in #0579 fails because the repository has no Apple credentials. Nick approved shipping an un-notarized DMG until credentials are set up.

## Desired UX

Every stable release tag gets `RepoOSHub.dmg` attached. With no Apple credentials at all, the DMG is uploaded un-notarized, as the landing page already describes ("Open Anyway"). Once credentials are added, the existing notarize, staple and verify gates apply automatically with no further change.

## Acceptance criteria

- In `.github/workflows/macos-hub.yml`, when NONE of the Apple notarization secrets are set, the release job skips notarization and stapling, still runs the build, bundle checks and DMG install check, uploads the DMG, and prints a clear warning and job-summary line saying it is not notarized.
- When ANY notarization secret is set, behaviour is unchanged: an incomplete set, rejection, timeout, staple or verification failure fails the job and nothing is uploaded.
- The `dry_run` dispatch still never publishes, and without credentials it fails or states plainly that notarization was not exercised.
- A pushed `v*` tag triggers the release job. Confirm the trigger configuration is valid, so tag runs are not skipped by the `paths` filter.
- `docs/macos-hub-release.md`, `user-docs/macos-hub.md` and the release checklist describe the actual behaviour, including the first-launch "Open Anyway" step.
- `user-docs/android-hub.md` no longer claims `releases/latest/download/...` falls back to an older release that has the file; it does not. Correct the same claim anywhere else it appears.
- Tests that assert workflow contents are updated to cover both the no-credential and credential paths.
- No secrets are added, printed or committed.

## Notes for AI

Do not implement Developer ID signing (#0577, #0578). Do not change the Android workflow or the landing page links.

## Activity

- 2026-11-28T00:00:35Z · created · t@t
- 2026-11-28T00:00:38Z · cli_override, model_override
- 2026-11-28T00:00:40Z · status inbox→ready
- 2026-11-28T00:00:42Z · status ready→active, branch
- 2026-11-28T00:04:17Z · body
