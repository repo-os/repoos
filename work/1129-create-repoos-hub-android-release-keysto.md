---
id: "1129"
title: Create RepoOS Hub Android release keystore and add GitHub signing secrets
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
updated_at: "2026-11-15T13:35:22Z"
---
## Problem
#1128 publishes a release-signed RepoOS Hub APK from GitHub Actions, and that needs a release signing key that only Nick should create and hold.

## Desired UX
Nick creates the key once, stores it safely, and adds it to the repo's GitHub Actions secrets. After that, every stable release tag gets a signed `RepoOSHub.apk`.

## Acceptance criteria
- A release keystore is generated (e.g. `keytool -genkeypair -v -keystore repoos-hub-release.jks -keyalg RSA -keysize 4096 -validity 10000 -alias repoos-hub`) and backed up somewhere safe outside the repo. Losing it means future APKs can't install over existing ones.
- GitHub Actions secrets are added on repo-os/repoos under the names #1128's workflow reads (keystore base64, store password, key alias, key password).
- The release certificate SHA-256 is recorded in `user-docs/android-hub.md`, so users can verify downloads.
- One `workflow_dispatch` run of the Android Hub workflow attaches a signed `RepoOSHub.apk` to an existing tag, and it installs on a real phone.

## Notes for AI
This is a human task. Agents must not create or commit a keystore, add secrets, or claim a device install happened.

## Human task

_Assigned to a human, not an AI agent. No `## Notes for AI` is required here; the acceptance criteria are the human's checklist._

## Activity

- 2026-11-15T13:35:22Z · created · t@t
