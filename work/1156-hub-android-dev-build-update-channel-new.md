---
id: "1156"
title: "Hub Android: dev build update channel - new dev builds reach the phone from any network with one tap (no adb)"
type: feature
status: active
priority: p1
area: [mobile, infra]
assigned_to: ai
created_by: t@t
branch: feat/hub-android-dev-build-update-channel-new
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-17T14:48:18Z"
updated_at: "2026-11-17T15:44:54Z"
handoff_signal_retry_count: 1
---
## Problem

Nick moves between wifi networks and mobile data all day. `just deploy-phone` needs Wireless debugging, whose port changes after every toggle or reboot, so new RepoOS Hub dev builds often cannot reach his phone (the phone is on Tailscale adb at a random port). The phone should pull new dev builds itself, from anywhere, with one tap, no adb, no ports, no cable. This is the same "dev build update channel" Nick is adding to his other Android apps (Tiao is the reference, task #0152 in the Tiao repo on host `bee`).

## Desired UX

On the phone, opening the RepoOS Hub Dev app (package `org.repoos.mobile.dev`) on any network shows "A new dev build is available (commit abc1234)" with short notes, and two buttons: **Download now** (opens the APK link so Android installs it over the existing dev app, upgrading in place with the debug key) and **Later** (snoozes for an hour). The Hub Settings page gets a "Dev updates" row showing the installed commit and a **Check now** button. Offline or on error: no dialog, no message.

## Acceptance criteria

- [ ] A publish script (scripts/publish-dev.sh or a `just publish-dev` recipe next to `deploy-phone`) builds the debug APK (the `.dev` variant) and uploads it plus `latest.json` to a private, unguessable URL `https://<host>/dev/<random-token>/latest.apk` and `.../latest.json`. `latest.json` is `{ versionName, versionCode, commit, builtAt, notes[] }` with short changelog lines from the tasks that landed.
- [ ] Hosting uses infrastructure the project already has (Cloudflare Workers static assets or R2 on the same account as the RepoOS site). It sends `X-Robots-Tag: noindex` and is never linked from any page, sitemap or llms.txt.
- [ ] The publish step runs automatically after a task lands on main (a post-close-out step or the driver's release routine) and on demand. The existing `just deploy-phone` adb path stays as a backup.
- [ ] The dev build checks `latest.json` on app open, at most once an hour, on any network; failures and offline are silent. A newer `versionCode` shows the dialog above; Settings has the "Dev updates" row with the installed commit and Check now.
- [ ] The release build (the public Hub) contains no code path, URL or token for this channel. It is gated on the dev build type/package, and a test or build check fails if the dev URL or token appears in the release variant.
- [ ] Any existing update-check or dialog code in mobile/ is reused (parameterise the source URL) instead of copied.
- [ ] The token is a secret: generated once, stored in a gitignored file or the project's secret store, read by the publish script and by the dev build's BuildConfig from that source. It is never committed, printed, logged, pasted into chat or task files, or shown in screenshots. docs/ explains how to create and rotate it and where each side reads it.
- [ ] Anything that needs Nick (Cloudflare access, creating the secret) is filed as a held human task with exact step-by-step instructions (`repoos new "<title>" --depends-on <id>` then `repoos update <new> --assigned-to human`); the engineer does not ask Nick to paste secrets.
- [ ] Landing a change produces a new `latest.json` and APK at the private URL with no manual step, once the human setup is done. On the phone, opening the dev app on mobile data shows the dialog and Download now upgrades it with data kept.

## Notes for AI

Follow the same shape as Tiao's implementation so all of Nick's apps behave identically: repo ~/code/nick/tiao on host bee; read its scripts/publish-dev.sh, the dev-update code in its Android app and its docs/ note on the token. If #0152 has not landed there yet, follow this task directly. Reuse the debug signing key so the APK upgrades in place. The dev app id is `org.repoos.mobile.dev` and the label "RepoOS Hub Dev" (see scripts/deploy-phone.ts and mobile/README.md). Do not edit repoos.toml. Report back in short plain English: what landed, what Nick must do himself (secret setup), and how to test it on his phone.

## Activity

- 2026-11-17T14:48:18Z · created · t@t
- 2026-11-17T15:21:05Z · cli_override, model_override
- 2026-11-17T15:21:09Z · status inbox→ready
- 2026-11-17T15:21:11Z · status ready→active, branch
- 2026-11-17T15:28:25Z · body
- 2026-11-17T15:31:30Z · body
- 2026-11-17T15:32:42Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: Implemented a first pass of the Android dev update check, Settings entry, on-demand publisher, and setup documentation. The required `REPOOS_CHECK_CHANGED=main repoos check` passed after formatting. The mobile build could not be verified l… · stderr: Reading additional input from stdin... 2026-11-17T15:24:11.767607Z ERROR codex_core::tools::router: error=apply_patch verification failed: Failed to find expected lines in /Users/nick/code/nick/repoos-worktrees/feat/hub-android-dev-build-update-channel-new/mobile/src/dev-updates.ts: info.build, 2026-11-17T15:24:19.268…
- 2026-11-17T15:44:54Z · body
