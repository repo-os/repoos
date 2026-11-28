---
id: "1129"
title: "Human: create the Hub Android release key and download bucket"
type: chore
status: inbox
hold: true
priority: p2
area: mobile
story: RepoOS Hub for Mobile
depends_on: ["1128"]
assigned_to: human
created_by: t@t
branch: ""
created_at: "2026-11-15T13:35:22Z"
updated_at: "2026-11-28T01:00:02Z"
---
## Problem

RepoOS Hub for Android has no public download. The app will be signed on your Mac and published to repoos.org (#1296), like Tiao. Only you should create and hold the release key. This replaces the earlier plan to store the key in GitHub secrets.

## Desired UX

You create the key once. After that, one command on your Mac publishes the app.

## Step-by-step guide

Never paste a password or key into a task, chat, commit or log.

1. Decide about Google Play now: the Play listing must use this same key, or people who installed from the website will have to uninstall before they can get the Play version. When you enrol in Play App Signing, choose to provide your own app signing key and upload this one.
2. Create the key and choose a strong password when prompted:

```bash
mkdir -p ~/keys
keytool -genkeypair -v -keystore ~/keys/repoos-hub-release.jks -alias repoos-hub -storetype PKCS12 -keyalg RSA -keysize 4096 -validity 10000
```

3. Back up the keystore file and its password somewhere safe outside the repo. Losing either means installed apps cannot be updated.
4. Create `~/.config/repoos-hub/release-signing.env` with `REPOOS_ANDROID_KEYSTORE_PATH` (the full path), `REPOOS_ANDROID_KEYSTORE_PASSWORD`, `REPOOS_ANDROID_KEY_ALIAS` and `REPOOS_ANDROID_KEY_PASSWORD`, one `NAME=value` per line, then run `chmod 600` on it. With PKCS12 the key password is the same as the keystore password.
5. Done 2026-11-28: the private `repoos-hub-downloads` bucket exists. Nothing to do. It was created with:

```bash
bunx wrangler r2 bucket create repoos-hub-downloads
```

6. Done: #1296 has been started.
7. After #1296 has landed and is deployed, run `just publish-hub-apk`, then download the app from repoos.org on a phone and install it.
8. Record the certificate SHA-256 that the command prints in `user-docs/android-hub.md`, or ask for a task to do it.

## Acceptance criteria

- The release key exists and is backed up outside the repo.
- The signing file exists on your Mac with owner-only permissions.
- The `repoos-hub-downloads` bucket exists and is private (done 2026-11-28).
- The APK downloaded from repoos.org installs on a real phone.

## Human task

_Assigned to a human, not an AI agent. No `## Notes for AI` is required here; the acceptance criteria are the human's checklist._

## Activity

- 2026-11-15T13:35:22Z · created · t@t
- 2026-11-28T00:38:35Z · title, body: Problem (added 1, removed 1); Desired UX (added 1, removed 1); Step-by-step guide (added); Acceptance criteria (added 4, removed 4); Notes for AI (removed)
- 2026-11-28T01:00:02Z · body: Step-by-step guide (added 2, removed 2); Acceptance criteria (added 1, removed 1)
