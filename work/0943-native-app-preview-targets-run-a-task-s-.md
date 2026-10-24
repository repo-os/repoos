---
id: "0943"
title: "Native app preview targets: run a task's macOS, iOS and Android build from its worktree"
type: feature
status: active
needs_input: true
needs_input_reason: dev-error
needs_input_detail: the agent process exited with an error — open the task to see the full output
priority: p2
area: [core, server, web]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/native-app-preview-targets-run-a-task-s-
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-23T20:05:41Z"
updated_at: "2026-10-24T14:34:03Z"
review_passes: 4
review_rounds: 2
routing_switches: 1
routing_escalations: 1
handoff_signal_retry_count: 1
dev_error_count: 1
---
## Problem
A task's **Preview** button only serves things that speak HTTP: a `[[preview.targets]]` row is a command that listens on `{port}` and answers a `readyPath` probe (`docs/previews.md`, "v1 is scoped to browser-previewable things"). A native app has no port, so a reviewer cannot launch a task's version of the macOS Hub (`macos/RepoOSHub.xcodeproj`, `just macos-run`), the iOS app or the Android app (`mobile/ios`, `mobile/android`, Capacitor shells) from the task's worktree. Today the options are weaker: a `[[dev.targets]]` row with `kind = "process"` (`user-docs/dev-targets.md`) always runs in the root checkout, never a task worktree, and `[[shot.targets]]` only captures still images (`docs/previews.md`, "Evidence shots for non-web targets", #0761).

Native macOS, iOS and Android all share one shape: build the worktree's code, install or launch it somewhere the human can see it, keep it running while the task is in `active`/`review`, and tear it down when the task leaves them. They differ in the install and launch step, not in the lifecycle.

## Desired UX
- `[[preview.targets]]` gets a new native flavour (working name `kind = "native"`; existing web targets are unchanged and stay the default) carrying a `platform` of `macos`, `ios` or `android`, a build `command`, a launch `command`, and optional `stop`, `cwd`, `env`, `requires` and `timeoutMs`. All commands run in the **task's worktree** and get the same placeholders and env as web previews (`REPOOS_WORKTREE`, task id) plus a per-task output directory.
- The Preview control in the task drawer lists native targets next to web ones, chosen by the task's `area` and changed `paths` exactly like web targets. Starting one builds, launches and reports `building` → `running` (or `failed` with the log tail). There is no URL to open; the card shows the platform, the device/simulator name where relevant and a Stop button.
- **macOS:** build with the worktree's `xcodebuild` into a per-worktree derived-data directory, then `open` the built `.app` (same recipe as `just macos-run`). Running means the app process is alive. Stop quits that process.
- **iOS:** build for the simulator, boot (or reuse) a simulator, `xcrun simctl install` and `launch`. Running means the app is launched on that simulator. Stop terminates the app. A device name or UDID is a target setting with a sensible default.
- **Android:** build the debug APK, start (or reuse) an emulator, `adb install -r` and launch the activity. Stop force-stops the app.
- Like web previews: **one native preview at a time, FIFO eviction**, reaped when the task leaves `active`/`review`, never auto-started, and started only on the human's request from the UI (or the existing managed-preview request signal). A missing tool (`xcodebuild`, `xcrun`, `adb`) fails with install advice, through the existing `requires` mechanism.
- Remote runners cannot show a native app on the human's screen: a native preview runs on the machine that owns the control plane, and the UI says so when the target is unavailable elsewhere.
- Native previews can also feed `repoos shot`: a launched simulator or app can be the thing a `[[shot.targets]]` command captures, so a declared shot does not need its own boot step. This is optional in v1 if it complicates the first cut.

## Acceptance criteria
- Config: the new target kind parses, validates (platform enum, required commands, unknown keys rejected with a pointer) and round-trips through the Settings UI; a Settings control exists per the repo rule for user-facing config keys, with a `getConfigSchema()` entry, the supported-keys list and docs (`tests/config-docs.test.ts`).
- Lifecycle tests with fake commands and no real Xcode/Android tooling: start builds then launches in the worktree (not the root checkout); a failed build or launch records the error and never reports `running`; Stop runs `stop` or terminates the child; leaving `active`/`review` reaps it; a second native preview evicts the first.
- Resolution tests: a task with area `mac`/`ios`/`android` and matching changed paths resolves to the native target; web resolution is untouched.
- UI: the Preview control shows a native target with its platform, state and Stop; no dead "open URL" button. Declare `## Shots` for the control in running and failed states, light and dark.
- Docs: `docs/previews.md` documents native targets with a worked recipe for each platform and states how they differ from `[[dev.targets]] kind = "process"` and `[[shot.targets]]`; `user-docs/` gets the user-facing version.
- Everything is a user-configured command: nothing is hard-coded to Apple or Android tooling in the server (same rule as #0761).

## Notes for AI
Start from `docs/previews.md`, the preview manager and its web target resolver, `src/core/shot-targets.ts` (changed-path resolution) and `src/core/shot-command.ts` (command targets run in the task worktree with `REPOOS_SHOT_DIR`/`REPOOS_WORKTREE`). Reuse the one-preview-at-a-time slot and reaping rather than adding a second manager. `kind = "process"` in `[[dev.targets]]` (`user-docs/dev-targets.md`) already models "alive means running" with no URL: borrow its health semantics, but scope it to a worktree. The Hub's own recipes are in the `justfile` (`macos-build`, `macos-run`, `macos-test`); the mobile shells are Capacitor projects under `mobile/` (`docs/mobile-architecture.md`). The mobile app opens the same web UI, so web-only mobile changes are already covered by the existing web preview. Tasks that only touch a native shell need this. Decide and record in the PR: whether iOS/Android reuse an already-booted device or always boot a dedicated one, and where per-worktree build output lives (it must be gitignored and removed with the worktree). Do not introduce a runtime dependency. Requested by the user on 2026-10-24.

## Shots
```json
[
{
"label": "Task drawer: running native iOS preview card (platform, device, Stop)",
"target": "default",
"route": "/work?task=9999&tab=overview",
"highlight": ".preview-live",
"state": "drawer:nativePreviewRunning"
},
{
"label": "Task drawer: native macOS preview shows building state during a long build",
"target": "default",
"route": "/work?task=9999&tab=overview",
"highlight": ".preview-live",
"state": "drawer:nativePreviewBuilding"
}
]
```

## Activity

- 2026-10-23T20:05:41Z · created · njachowski@gmail.com
- 2026-10-23T21:04:21Z · status inbox→ready
- 2026-10-23T21:05:03Z · status ready→active, branch
- 2026-10-23T21:10:58Z · body
- 2026-10-23T21:14:29Z · body
- 2026-10-23T21:17:47Z · body
- 2026-10-23T21:20:45Z · body
- 2026-10-23T21:21:36Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-23T21:28:29Z · message_queued at 2026-10-23T21:28:29.904Z
- 2026-10-23T21:28:30Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-23T21:29:14Z · body
- 2026-10-23T21:29:59Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-23T21:29:59Z · message_delivered: 1 message(s)
- 2026-10-23T21:31:49Z · body
- 2026-10-23T21:32:27Z · body
- 2026-10-23T21:34:55Z · body
- 2026-10-23T21:37:25Z · body
- 2026-10-23T21:50:40Z · note: ui verification passed: 4 of 4 shots captured with clean console (1 shot warning)
- 2026-10-23T21:50:41Z · status active→review
- 2026-10-23T21:52:27Z · note: review pass 1: needs some work
- 2026-10-23T21:52:28Z · status review→active
- 2026-10-23T21:52:30Z · CTO nudge: held — remote validation is running
- 2026-10-23T21:55:06Z · body
- 2026-10-23T22:09:24Z · note: ui verification passed: 4 of 4 shots captured with clean console (1 shot warning)
- 2026-10-23T22:09:25Z · status active→review
- 2026-10-23T22:10:36Z · note: review pass 2: needs some work
- 2026-10-23T22:10:38Z · status review→active
- 2026-10-23T22:10:40Z · CTO nudge: held — remote validation is running
- 2026-10-23T22:13:04Z · body
- 2026-10-23T22:26:32Z · note: ui verification passed: 4 of 4 shots captured with clean console (1 shot warning)
- 2026-10-23T22:26:33Z · status active→review
- 2026-10-23T22:28:20Z · note: review pass 3: needs some work
- 2026-10-23T22:28:20Z · needs_input
- 2026-10-24T08:29:08Z · cli_override, model_override
- 2026-10-24T08:29:11Z · model_override
- 2026-10-24T08:29:14Z · model_override
- 2026-10-24T11:13:07Z · status review→active
- 2026-10-24T11:13:17Z · needs_input
- 2026-10-24T11:13:18Z · message_queued at 2026-10-24T11:13:18.241Z
- 2026-10-24T11:13:59Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-24T11:24:14Z · body
- 2026-10-24T11:27:14Z · body
- 2026-10-24T11:28:18Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-10-24T11:28:18Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-24T11:28:19Z · status active→review
- 2026-10-24T11:28:19Z · message_delivered: 1 message(s)
- 2026-10-24T11:28:19Z · note: handoff requested (cli)
- 2026-10-24T11:29:04Z · CTO nudge: held — handoff gate is running
- 2026-10-24T11:41:28Z · note: ui verification passed: 4 of 4 shots captured with clean console (1 shot warning)
- 2026-10-24T11:41:29Z · status active→review
- 2026-10-24T11:42:31Z · note: review pass 4: needs some work
- 2026-10-24T11:42:31Z · needs_input
- 2026-10-24T12:03:47Z · status review→active
- 2026-10-24T12:04:01Z · needs_input
- 2026-10-24T12:04:02Z · message_queued at 2026-10-24T12:04:02.365Z
- 2026-10-24T12:05:56Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-24T12:14:04Z · body
- 2026-10-24T13:02:04Z · body
- 2026-10-24T13:11:02Z · message_overdue: still queued after 60m without being delivered
- 2026-10-24T14:00:25Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-10-24T14:01:24Z · message_overdue: still queued after 60m without being delivered
- 2026-10-24T14:01:24Z · message_delivered: 1 message(s)
- 2026-10-24T14:30:03Z · message_queued at 2026-10-24T14:30:03.400Z
- 2026-10-24T14:30:03Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-24T14:32:52Z · cli_override, model_override
- 2026-10-24T14:33:14Z · body
- 2026-10-24T14:34:03Z · body
