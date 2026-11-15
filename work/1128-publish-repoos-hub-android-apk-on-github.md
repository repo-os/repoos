---
id: "1128"
title: Publish RepoOS Hub Android APK on GitHub Releases and link it from the landing page and docs
type: feature
status: active
priority: p2
area: [mobile, web]
story: RepoOS Hub for Mobile
assigned_to: ai
created_by: t@t
branch: feat/publish-repoos-hub-android-apk-on-github
created_at: "2026-11-15T13:35:11Z"
updated_at: "2026-11-15T14:03:27Z"
---
## Problem
RepoOS Hub for Android (`mobile/`, Capacitor app `org.repoos.mobile`) has no public download. The only way to get it today is to build it locally with `just build-android` and sideload the debug APK over adb. The macOS Hub already has a public download: `.github/workflows/macos-hub.yml` builds `RepoOSHub.dmg` on every stable `v*` tag and attaches it to the GitHub Release, and both the landing page (`landing/src/App.vue`, "Download for Mac" pointing at `https://github.com/repo-os/repoos/releases/latest/download/RepoOSHub.dmg`) and `user-docs/macos-hub.md` link to it. Android should have the same thing.

The Tiao app (a separate repo) is the reference for how the APK should be shared: a release-signed APK (never the debug key), a script that refuses to publish an APK signed with the debug certificate, Android 8.0+ called out, and a download card on the landing page that says it isn't on the Play Store yet.

## Desired UX
- The landing page shows a **Download for Android** button next to "Download for Mac". It links to `https://github.com/repo-os/repoos/releases/latest/download/RepoOSHub.apk` and has a short note: not on the Play Store yet, sideload the APK, Android 8.0 (API 26) or newer.
- The docs site gets an Android Hub page (e.g. `user-docs/android-hub.md`, modelled on `user-docs/macos-hub.md`). It covers the download link and requirements, how to allow installing from unknown sources, how to verify the APK's signing certificate SHA-256, and how updates work (download the newer APK and install over the old one). It also links to the privacy model in `docs/mobile-architecture.md`.
- Every stable release tag has `RepoOSHub.apk` attached to its GitHub Release, alongside `RepoOSHub.dmg`.

## Acceptance criteria
- A new GitHub Actions workflow (e.g. `.github/workflows/android-hub.yml`, mirroring `macos-hub.yml`: runs on `v*` tags plus `workflow_dispatch` with an existing tag) builds the web assets and runs `cap sync`. It then builds a **release-signed** APK and uploads it to the tag's GitHub Release as `RepoOSHub.apk`, with the same prerelease and stable handling as the DMG.
- Release signing comes from GitHub Actions secrets (keystore base64, store password, key alias, key password), never from committed files. `mobile/android/app/build.gradle` gets a `release` signingConfig that reads them from the environment or Gradle properties, and the build fails clearly when they're missing.
- The workflow refuses to upload an APK signed with the Android debug certificate (compare certificate SHA-256 values with `apksigner verify --print-certs`), and prints the release certificate SHA-256 in the job summary.
- `versionName` and `versionCode` come from the release tag or `package.json` version, so each release's APK installs over the previous one.
- The landing page has the Android download button and note, and keeps the Mac button working. The docs nav includes the new Android Hub page, and `user-docs/getting-started.md` mentions both Hubs where it mentions the Mac one.
- A local `just build-android-release` recipe (or a flag on the existing one) builds the same release APK when the signing env vars are set, and refuses the debug key.
- Docs: `docs/releases.md` lists the APK as a release asset, and `mobile/README.md` explains release signing.
- Until the human task supplies the signing secrets, the workflow skips the APK upload with a clear message and doesn't fail the release.

## Notes for AI
- Copy the structure of `.github/workflows/macos-hub.yml` (triggers, prerelease gating, `softprops/action-gh-release@v2` upload) instead of inventing a new flow.
- Capacitor Android project: `mobile/android/`. Web build: `cd mobile && bun install && bun run build && bun run sync`. JDK 21.
- Keep the debug build's `.dev` applicationIdSuffix. The public APK is the release variant, `org.repoos.mobile`.
- Creating the release keystore and adding the GitHub secrets is a human step, tracked as a separate held task. Don't create or commit a keystore and don't invent certificate fingerprints.
- Landing page: `landing/src/App.vue` near the existing "Download for Mac" link. Docs site: `user-docs/`.

## Shots
```json
[
{
"label": "RepoOS Hub for Android section with download button and sideload note",
"target": "Landing page",
"route": "/#android-hub",
"highlight": "a[href*=\"RepoOSHub.apk\"]"
},
{
"label": "New Android Hub guide page",
"target": "Docs site",
"route": "/android-hub",
"highlight": "h1"
}
]
```

## Activity

- 2026-11-15T13:35:11Z · created · t@t
- 2026-11-15T13:36:29Z · status inbox→ready
- 2026-11-15T13:36:31Z · status ready→active, branch
- 2026-11-15T13:53:36Z · body
- 2026-11-15T13:54:48Z · body
- 2026-11-15T13:57:49Z · body
- 2026-11-15T14:01:00Z · body
- 2026-11-15T14:03:24Z · message_queued at 2026-11-15T14:03:24.867Z
- 2026-11-15T14:03:27Z · message_delivered: 1 message(s)
