---
id: "0854"
title: "Remote shot capture: run previews, shots and UI verification on a runner instead of the laptop"
type: feature
status: review
priority: p2
area: [server, core]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/remote-shot-capture-run-previews-shots-a
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-19T14:24:21Z"
updated_at: "2026-10-20T11:10:39Z"
review_passes: 12
last_check_failure: "repoos check at 2026-10-20T09:53:53.364Z: repoos check failed: ◆ Check plan"
review_rounds: 2
handoff_signal_retry_count: 2
dev_error_count: 3
---
## Problem
Tests already run on Tailscale runners (docs/remote-validation.md), but everything browser-related still runs on the control-plane laptop: the per-task preview (`bun run build` with vue-tsc + vite, then `repoos serve`), Playwright/WebKit captures of declared and automatic shots, the handoff UI verification, `repoos shot` and `repoos verify`. With several engineers handing off at once this is the dominant local load (dozens of WebKit processes, repeated full UI builds, 20+ GB of memory pressure on 2026-10-18/19). `remoteValidation.offloadBrowserSteps` (#0836, default off) only moves the smoke and rendered-contrast gate steps, not shots or UI verification.

## Desired UX
Shot capture and UI verification can run on a runner:
- At handoff (and for `repoos shot` / `repoos verify`), when a runner with Playwright/WebKit is available, the control plane ships the task bundle (already done for tests), the runner builds the UI, starts the app in preview mode inside the runner's container, captures every declared and automatic shot and the UI-verification record using the same fixtures and step vocabulary, and returns the PNGs, `shots.json` and the verification record as artifacts. Results land in the same places (`work/.attachments/<id>/shots`, task activity) so the Changes tab and the reviewer see no difference.
- A Settings control (Performance) selects where browser work runs: `local`, `runner when available` (default once proven), `runner only`. Local stays the fallback and stays under the existing Playwright cap.
- The laptop no longer builds or serves a preview for routine handoff evidence; a human-requested interactive preview (the Preview button) stays local.

## Acceptance criteria
- A short written design in docs first: what the runner image needs (Playwright, WebKit, fonts), how the bundle/artifacts round-trip works, how fixtures and the dev-login/auth-less preview mode are handled, failure and fallback rules, and the security note (no secrets in the bundle).\n- Tests with a fake runner transport: capture runs remotely and returns artifacts; a missing browser or a runner failure falls back locally with a visible note; declared-shot failures are reported exactly as local ones are (a missing target still fails the handoff).\n- Settings control, docs/remote-validation.md and docs/previews.md updated.\n- Real end-to-end runner proof (a UI-visible task handoff captured entirely remotely, with the local Playwright/WebKit process count unchanged) is tracked in held human task #0864, which depends on this task.

## Notes for AI
Start with the design doc and a small spike: reuse validate.sh, the bundle upload and the artifacts channel from remote validation, and the existing shot planner (src/core/shot-plan.ts, src/server/shot*.ts). Depends on nothing but benefits from the preview-teardown fix (separate task). Do not touch repoos.toml. Source: Nick, 2026-10-19.\n\nRemote end-to-end proof is still outstanding. On 2026-10-20, the runner probe succeeded. The first direct TailscaleRunner browser capture attempt for task 0854 at candidate SHA 2ce0b812305e74539f33547fcfdf2de2e3013698 returned no capture result or artifacts after more than two minutes. After the scoped check passed and the runner slot became free, I retried once at candidate SHA 7c59a6b3e35d15f8acac44e35720d348490d9077. That attempt waited while bee was running task 0861 and still returned no capture result/artifacts after 2m40s, so I stopped it; neither attempt is proof of remote capture. The configured runner uses a prebuilt repoos-ci image, so the Dockerfile WebKit installation in this branch has not yet been verified in that image. A human must rebuild/deploy the runner image from scripts/remote-runner/Dockerfile.ci, then hand off a UI-visible task with browserCaptureMode set to runner-only and verify the returned PNGs, shots.json, and UI verification record; record the local Playwright/WebKit process count immediately before and during that handoff and confirm it does not increase.

## Shots
```json
[
{
"label": "Performance setting for task browser work",
"target": "default",
"route": "/settings",
"highlight": "[id=\"setting-remoteValidation.browserCaptureMode\"]"
}
]
```

## Activity

- 2026-10-19T14:24:21Z · created · njachowski@gmail.com
- 2026-10-20T04:26:47Z · status inbox→ready
- 2026-10-20T04:26:50Z · cli_override, model_override
- 2026-10-20T04:26:54Z · status ready→active, branch
- 2026-10-20T04:39:01Z · CTO action: restart-stalled-agent (fresh) · agent exited without emitting the handoff signal
- 2026-10-20T04:45:07Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-10-20T04:45:07Z · note: handoff requested (cli)
- 2026-10-20T04:52:44Z · status active→review
- 2026-10-20T04:52:47Z · note: shots: skipped — the diff (2 changed paths) touches no capture target's globs — no UI change to capture
- 2026-10-20T05:00:29Z · note: review pass 1: back to the drawing board
- 2026-10-20T05:00:30Z · status review→active
- 2026-10-20T05:17:31Z · message_queued at 2026-10-20T05:17:31.884Z
- 2026-10-20T05:17:32Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-20T05:48:54Z · note: Review round 1 requested implementation fixes; resuming work in the existing task worktree.
- 2026-10-20T05:49:17Z · message_delivered: 1 message(s)
- 2026-10-20T05:50:06Z · status active→review
- 2026-10-20T05:50:06Z · note: handoff requested (cli)
- 2026-10-20T05:57:03Z · status active→review
- 2026-10-20T05:57:04Z · note: shots: skipped — the diff (2 changed paths) touches no capture target's globs — no UI change to capture
- 2026-10-20T05:57:50Z · note: review pass 2: back to the drawing board
- 2026-10-20T05:57:50Z · status review→active
- 2026-10-20T06:54:58Z · status active→ready
- 2026-10-20T06:55:04Z · status ready→active
- 2026-10-20T06:58:53Z · status active→review
- 2026-10-20T06:58:54Z · note: handoff requested (cli)
- 2026-10-20T07:07:31Z · handoff failed · task-file handoff failed at check · remote validation failed: test failure: tests/config-docs.test.ts > repoos.toml and environment docs > documents every field in the config schema, tests/config-docs.test.ts > repoos.toml and environment docs > documents every key the parser supports, including parser-only sections on thinkpad — fix it in the feature branch and re-run the gate
- 2026-10-20T07:10:03Z · status active→ready
- 2026-10-20T07:10:20Z · status ready→active
- 2026-10-20T07:15:43Z · body
- 2026-10-20T07:16:16Z · body
- 2026-10-20T07:20:31Z · body
- 2026-10-20T07:20:43Z · status active→review
- 2026-10-20T07:20:43Z · note: handoff requested (cli)
- 2026-10-20T07:27:44Z · handoff failed · task-file handoff failed at check · remote validation failed: test failure: tests/config-docs.test.ts > repoos.toml and environment docs > documents every field in the config schema, tests/config-docs.test.ts > repoos.toml and environment docs > documents every key the parser supports, including parser-only sections on thinkpad — fix it in the feature branch and re-run the gate
- 2026-10-20T08:25:38Z · body
- 2026-10-20T08:26:45Z · body
- 2026-10-20T08:30:23Z · body
- 2026-10-20T08:36:25Z · note: Remote capture proof attempt: direct TailscaleRunner capture for the current task SHA queued on bee while its validation slot was occupied, and was canceled before container execution. The local WebKit process count was 57 before and during the wait; no capture artifacts were returned. The required handoff proof is still outstanding.
- 2026-10-20T08:36:43Z · status active→review
- 2026-10-20T08:36:43Z · note: handoff requested (cli)
- 2026-10-20T08:57:18Z · status active→review
- 2026-10-20T08:57:19Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (2ce0b8123) during finalization (#0734)
- 2026-10-20T08:57:19Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (2ce0b8123) during finalization (#0734)
- 2026-10-20T08:59:05Z · note: review pass 3: needs some work
- 2026-10-20T08:59:05Z · needs_input
- 2026-10-20T09:02:43Z · needs_input
- 2026-10-20T09:02:44Z · status review→active
- 2026-10-20T09:02:44Z · note: follow-up message — moved from review to active so work can be committed and re-handoffed
- 2026-10-20T09:08:46Z · body: Notes for AI (added 1, removed 1)
- 2026-10-20T09:08:47Z · message_queued at 2026-10-20T09:08:47.062Z
- 2026-10-20T09:14:21Z · body
- 2026-10-20T09:18:01Z · body
- 2026-10-20T09:22:21Z · body: Notes for AI (added 1, removed 1)
- 2026-10-20T09:22:22Z · message_queued at 2026-10-20T09:22:22.771Z
- 2026-10-20T09:22:54Z · body
- 2026-10-20T09:23:14Z · status active→review
- 2026-10-20T09:26:52Z · note: review pass 4: needs some work
- 2026-10-20T09:26:52Z · needs_input
- 2026-10-20T09:32:04Z · needs_input
- 2026-10-20T09:32:04Z · status review→active
- 2026-10-20T09:32:04Z · note: follow-up message — moved from review to active so work can be committed and re-handoffed
- 2026-10-20T09:32:05Z · message_delivered: 2 message(s)
- 2026-10-20T09:32:34Z · body: Acceptance criteria (added 1, removed 4)
- 2026-10-20T09:32:35Z · message_queued at 2026-10-20T09:32:35.474Z
- 2026-10-20T09:38:20Z · body
- 2026-10-20T09:39:28Z · status active→review
- 2026-10-20T09:41:42Z · note: review pass 5: needs some work
- 2026-10-20T09:41:42Z · needs_input
- 2026-10-20T09:47:28Z · needs_input
- 2026-10-20T09:47:54Z · status review→active
- 2026-10-20T09:47:54Z · note: follow-up message — moved from review to active so work can be committed and re-handoffed
- 2026-10-20T09:48:32Z · message_queued at 2026-10-20T09:48:32.790Z
- 2026-10-20T09:53:42Z · message_delivered: 2 message(s)
- 2026-10-20T09:59:05Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — task-file handoff failed at check · remote validation failed: test failure: tests/config-docs.test.ts > repoos.toml and environment docs > documents every field in the config schema, tests/config-docs.test.ts > repoos.toml and environment docs > documents every key the parser supports, including parser-only sections on thinkpad — fix it in the feature branch and re-run the gate · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-10-20T09:59:05Z · note: handoff requested (cli)
- 2026-10-20T10:02:20Z · status active→review
- 2026-10-20T10:02:21Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (ecd1465cf) during finalization (#0734)
- 2026-10-20T10:02:22Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (ecd1465cf) during finalization (#0734)
- 2026-10-20T10:05:18Z · note: review pass 6: needs some work
- 2026-10-20T10:05:19Z · needs_input
- 2026-10-20T10:09:26Z · needs_input
- 2026-10-20T10:09:28Z · status review→active
- 2026-10-20T10:09:28Z · note: follow-up message — moved from review to active so work can be committed and re-handoffed
- 2026-10-20T10:21:06Z · body
- 2026-10-20T10:21:51Z · status active→review
- 2026-10-20T10:26:18Z · note: review pass 7: needs some work
- 2026-10-20T10:26:18Z · needs_input
- 2026-10-20T10:28:26Z · needs_input
- 2026-10-20T10:28:26Z · status review→active
- 2026-10-20T10:28:26Z · note: follow-up message — moved from review to active so work can be committed and re-handoffed
- 2026-10-20T10:28:26Z · message_queued at 2026-10-20T10:28:26.804Z
- 2026-10-20T10:28:44Z · status active→review
- 2026-10-20T10:28:44Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (8337270ca) during finalization (#0734)
- 2026-10-20T10:28:45Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (8337270ca) during finalization (#0734)
- 2026-10-20T10:30:25Z · note: review pass 8: needs some work
- 2026-10-20T10:30:25Z · needs_input
- 2026-10-20T10:33:21Z · needs_input
- 2026-10-20T10:37:58Z · status review→active
- 2026-10-20T10:37:58Z · note: follow-up message — moved from review to active so work can be committed and re-handoffed
- 2026-10-20T10:37:58Z · message_delivered: 1 message(s)
- 2026-10-20T10:42:45Z · body
- 2026-10-20T10:43:45Z · status active→review
- 2026-10-20T10:47:34Z · note: review pass 9: needs some work
- 2026-10-20T10:49:49Z · note: review pass 10: needs some work
- 2026-10-20T10:49:49Z · needs_input
- 2026-10-20T10:52:17Z · needs_input
- 2026-10-20T10:52:17Z · status review→active
- 2026-10-20T10:52:17Z · note: follow-up message — moved from review to active so work can be committed and re-handoffed
- 2026-10-20T10:52:30Z · agent exited with an error (codex) · 2026-10-20T10:43:35.849544Z ERROR codex_core::tools::router: error=write_stdin failed: Unknown process id 90846
- 2026-10-20T10:52:30Z · status active→review
- 2026-10-20T10:52:31Z · note: handoff requested (cli)
- 2026-10-20T10:53:40Z · status active→review
- 2026-10-20T10:53:40Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (a2c7d06dc) during finalization (#0734)
- 2026-10-20T10:53:40Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (a2c7d06dc) during finalization (#0734)
- 2026-10-20T10:56:35Z · note: review pass 11: needs some work
- 2026-10-20T10:57:10Z · needs_input
- 2026-10-20T10:57:10Z · status review→active
- 2026-10-20T10:57:10Z · note: follow-up message — moved from review to active so work can be committed and re-handoffed
- 2026-10-20T10:57:18Z · agent exited with an error (codex) · 2026-10-20T10:43:35.849544Z ERROR codex_core::tools::router: error=write_stdin failed: Unknown process id 90846
- 2026-10-20T10:57:18Z · status active→review
- 2026-10-20T10:57:19Z · note: handoff requested (cli)
- 2026-10-20T10:58:27Z · status active→review
- 2026-10-20T10:58:27Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (a2c7d06dc) during finalization (#0734)
- 2026-10-20T10:58:28Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (a2c7d06dc) during finalization (#0734)
- 2026-10-20T11:02:59Z · note: review pass 12: needs some work
- 2026-10-20T11:09:09Z · needs_input
- 2026-10-20T11:09:09Z · status review→active
- 2026-10-20T11:09:09Z · note: follow-up message — moved from review to active so work can be committed and re-handoffed
- 2026-10-20T11:09:18Z · agent exited with an error (codex) · 2026-10-20T10:43:35.849544Z ERROR codex_core::tools::router: error=write_stdin failed: Unknown process id 90846
- 2026-10-20T11:09:18Z · status active→review
- 2026-10-20T11:09:19Z · needs_input
- 2026-10-20T11:09:19Z · note: handoff requested (cli)
- 2026-10-20T11:10:38Z · status active→review
- 2026-10-20T11:10:38Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (a2c7d06dc) during finalization (#0734)
- 2026-10-20T11:10:39Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (a2c7d06dc) during finalization (#0734)
