---
id: "1296"
title: "Publish the Android Hub APK from your Mac to repoos.org, Tiao style"
type: feature
status: active
priority: p2
area: [mobile, docs]
story: RepoOS Hub for Mobile
assigned_to: ai
created_by: t@t
branch: feat/publish-the-android-hub-apk-from-your-ma
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-28T00:38:18Z"
updated_at: "2026-11-28T01:09:14Z"
---
## Problem

The "Download for Android" links on repoos.org and in the docs return 404. They expect GitHub Actions to sign the APK with secrets that do not exist. Nick wants Tiao's approach instead: the release key stays on the maintainer's Mac, one command builds, signs and publishes, and the app is downloaded from the project's own site. The Play Store will later be the main way to get it.

## Desired UX

- The maintainer runs `just publish-hub-apk`. It builds a release-signed APK and publishes it to repoos.org.
- The Android section on repoos.org shows a download button with the version when an APK is published, and "Coming soon" with no link otherwise. No other new UI.

## Acceptance criteria

- A local publish command builds the release APK using the existing `REPOOS_ANDROID_*` signing values, read from the environment or an untracked file outside the repository (`~/.config/repoos-hub/release-signing.env`). Values are never printed or committed, and Gradle runs with the configuration cache off.
- It refuses to publish a debug-signed or debuggable APK (reuse `mobile/scripts/verify-release-apk.ts`) and fails clearly when signing or Cloudflare credentials are missing. It has a dry-run mode that uploads nothing.
- It uploads the APK and a `version.json` (version name, version code, size, SHA-256, certificate SHA-256, build time) to the private R2 bucket `repoos-hub-downloads`.
- `landing/worker.ts` serves only those two objects at `https://repoos.org/downloads/repoos-hub.apk` and `/downloads/version.json`, with the APK sent as an attachment with the Android content type, short caching for the JSON, and 404 when absent. `wrangler.jsonc` gets the binding and routing. A normal site deploy never removes the published APK.
- The landing page and `user-docs/android-hub.md` link to the repoos.org address. The docs describe the real publishing and update steps and drop the GitHub download and fallback claims.
- The Android workflow still builds and tests, but no longer implies that a release attaches an APK. Any release runbook text matches.
- Tests cover the Worker routes, the "Coming soon" and available states, and the publish script's refusals. No new runtime dependencies.

## Notes for AI
The private R2 bucket `repoos-hub-downloads` exists (created 2026-11-28) in the RepoOS Cloudflare account. Do not create keys, buckets or secrets, do not deploy, and do not publish a real APK. Reference implementation: Tiao's `scripts/build-release.sh` and `scripts/publish-site.sh`. Do not change the Mac download.

## Activity

- 2026-11-28T00:38:18Z · created · t@t
- 2026-11-28T01:00:02Z · body: Notes for AI (added 1, removed 1)
- 2026-11-28T01:00:03Z · cli_override, model_override
- 2026-11-28T01:00:05Z · status inbox→ready
- 2026-11-28T01:00:06Z · status ready→active, branch
- 2026-11-28T01:09:14Z · body
