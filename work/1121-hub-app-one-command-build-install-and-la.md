---
id: "1121"
title: "Hub app: one-command build, install and launch on Nick's Android phone over Tailscale adb"
type: feature
status: done
priority: p2
area: mobile
merged_commit: 4209ec5cc9bb70311cbdd2b45b491d326ee4dc27
assigned_to: ai
created_by: t@t
branch: feat/hub-app-one-command-build-install-and-la
cli_override: cursor
model_override: composer-2.5
created_at: "2026-11-14T17:35:18Z"
updated_at: "2026-11-15T01:20:51Z"
last_close_out_gate_ms: 301749
last_close_out_gate_at: "2026-11-15T01:20:51.829Z"
review_passes: 1
handoff_signal_retry_count: 2
---
## Problem
Getting a new RepoOS Hub Android build onto Nick's phone is manual (`just build-android`, then copy the APK). The Laisen project already has a working one-command flow (scripts/deploy-phone.sh on the thinkpad, with a Tiao version at ~/code/nick/reference/tiao/scripts/deploy-phone.sh) that builds the debug APK, connects over Tailscale + adb, installs, and launches. The Hub app should have the same.

## Desired UX
`just deploy-phone` (flags `--no-build`, `--no-scan`) builds the debug APK in mobile/android, connects to the phone over Tailscale adb, installs it with `adb install -r -d`, force-stops, launches it, and prints the short commit. On failure it prints what to do on the phone (Tailscale connected, Wireless debugging on, the port) and how to retry.

## Acceptance criteria
1. Read the Laisen reference first (read-only: `ssh thinkpad`, then `cd ~/code/nick/laisen`: scripts/deploy-phone.sh, scripts/lib/launch-component.sh, scripts/test-deploy-phone.sh, repoos/docs/phone-deploy.md; Tiao version at ~/code/nick/reference/tiao/scripts/deploy-phone.sh). Reproduce its behaviour: target from env, then config file, then default; try the saved address, then other open adb ports already connected, then a scan of ports 30000-49999 (nmap if present, otherwise a socket scan) when scanning is allowed; wait about a second after `adb connect` before `adb get-state` must say `device`; save the last working address; `INSTALL_FAILED_UPDATE_INCOMPATIBLE` prints the one-time `adb uninstall <app id>` advice and stops.
2. Follow this repo's conventions: write the script in TypeScript for Bun (`#!/usr/bin/env bun`, scripts/ folder) plus a `deploy-phone` recipe in the justfile in the mobile group, not bash. The launch component helper must produce the fully qualified `<application id>/<fully.qualified.MainActivity>` and reject relative or malformed activity classes, with a test.
3. App identity: today the Android application id is org.repoos.mobile and the activity is org.repoos.mobile.MainActivity (mobile/android/app/build.gradle, AndroidManifest). Decide and document whether the debug build should get `applicationIdSuffix ".dev"` so it installs next to the release build like Laisen (recommended); if you add it, update the launch component, mobile/README.md and the justfile, and make sure the release build id does not change.
4. The phone address is private: do NOT commit the phone IP, ports, pairing data or any secret. Read the target from `REPOOS_HUB_PHONE` (ip:port), `REPOOS_HUB_PHONE_PORT`, then `~/.config/repoos-hub/phone` (one line, `ip:port`, already present on this Mac with the stable Tailscale IP and an empty port); no default IP in the repo. Never commit APKs; confirm build outputs are gitignored.
5. Tests with a fake `adb` (a script or injected runner) cover: connect to the saved address, fall back to another open port, the port scan finding the port, a failed connect with the clear instructions, the launch component, the update-incompatible message, and `--no-build`/`--no-scan`. They run without a phone, a JDK or the Android SDK.
6. A short doc (mobile/README.md section or docs/phone-deploy.md) explains the one-time setup: `brew install --cask android-platform-tools` (adb), a JDK 17 or 21 and the Android SDK, the Tailscale name and the shared phone, the two connection modes (fixed port 5555 after a one-time `adb tcpip 5555`, or Wireless debugging with a random port that Android resets on network changes), the Tailscale warning-triangle gotcha (toggle Tailscale off and on), and what to do when the phone is unreachable. Mention that Wireless debugging allows one connection at a time, so a deploy from another machine can kick this one off.
7. Hard limits: debug builds only; no release signing; never run `adb pair` or the USB `adb tcpip 5555` step, those are Nick's; do not run any real install. This task ends at tests passing and the doc. List in the report exactly what the first real install will replace (app id, and whether the suffix means it installs beside the existing app) so Nick can approve it.

## Notes for AI
Related: #1120 (Hub app redesign, runs in parallel, touches mobile/src only) and docs/previews.md (native preview targets can call the same script later). Keep this task to scripts, the justfile recipe, Gradle debug suffix (if chosen) and docs.

## Activity

- 2026-11-14T17:35:18Z · created · t@t
- 2026-11-14T17:35:22Z · cli_override, model_override
- 2026-11-14T17:35:24Z · status inbox→ready
- 2026-11-14T17:35:25Z · status ready→active, branch
- 2026-11-14T17:43:53Z · message_queued at 2026-11-14T17:43:53.125Z
- 2026-11-14T17:43:53Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-14T17:46:53Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-14T17:46:54Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 143) · last assistant: Implementing TypeScript deploy scripts, tests, Gradle debug suffix, justfile recipe, and docs. · stderr: (empty)
- 2026-11-14T17:48:53Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-14T17:53:57Z · message_queued at 2026-11-14T17:53:57.407Z
- 2026-11-14T17:57:10Z · message_delivered: 1 message(s)
- 2026-11-14T17:59:09Z · queued message undelivered for 5m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-14T17:59:09Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 143) · last assistant: Updating the build step to match `just build-android`, then running the full check. · stderr: (empty)
- 2026-11-14T18:01:04Z · message_queued at 2026-11-14T18:01:04.853Z
- 2026-11-14T18:06:12Z · message_queued at 2026-11-14T18:06:12.460Z
- 2026-11-14T18:08:49Z · message_delivered: 1 message(s)
- 2026-11-14T18:10:54Z · queued message undelivered for 10m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-14T18:10:54Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 143) · last assistant: Updating the build step to match `just build-android`, then running the full check. · stderr: (empty)
- 2026-11-14T18:15:54Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-11-14T18:15:55Z · note: handoff requested (cli)
- 2026-11-14T18:18:53Z · CTO nudge: held — handoff gate is running
- 2026-11-14T18:31:00Z · message_delivered: 2 message(s)
- 2026-11-14T18:35:44Z · handoff failed · task-file handoff failed at check · the worktree changed while the gate was running (appeared: docs/phone-deploy.md, mobile/README.md, scripts/deploy-phone.ts, scripts/lib/hub-phone-deploy.ts, scripts/lib/launch-component.ts, src/ui-app/tests/hub-phone-deploy.test.ts, mobile/android/app/src/debug/, src/ui-app/tests/hub-android-debug-label.test.ts) — the check result no longer describes what is committed, so the handoff was refused. Nothing was lost: the change is still in the worktree. Re-run the handoff once the worktree is stable.
- 2026-11-14T18:49:53Z · note: handoff requested (cli)
- 2026-11-14T18:49:54Z · note: shots: skipped — the diff (12 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-14T18:59:55Z · watchdog: restarting engineer after 10m with no live process
- 2026-11-14T19:03:53Z · CTO nudge: held — remote validation is running
- 2026-11-14T19:14:13Z · body
- 2026-11-14T19:16:45Z · status active→review
- 2026-11-14T19:16:46Z · note: shots: skipped — the diff (12 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-14T19:19:54Z · handoff failed · task-file handoff failed at check · server-side finalization timed out (deadline exceeded)
- 2026-11-14T19:24:48Z · note: review pass 1: good to go
- 2026-11-14T19:24:49Z · message_queued at 2026-11-14T19:24:49.618Z
- 2026-11-14T21:07:42Z · message_overdue: still queued after 60m without being delivered
- 2026-11-15T00:47:38Z · close-out gate completed in 712s
- 2026-11-15T01:20:51Z · close-out gate completed in 302s

