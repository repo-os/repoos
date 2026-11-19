---
id: "1222"
title: "QA pass: every Settings tab saves, validates and fits small screens (round 2)"
type: bug
status: done
priority: p2
area: web
merged_commit: e8472b9d03513cec84b17c75057b4188c10b1704
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-every-settings-tab-saves-validat
created_at: "2026-11-19T07:17:47Z"
updated_at: "2026-11-19T09:33:57Z"
last_close_out_gate_ms: 68924
last_close_out_gate_at: "2026-11-19T09:33:54.356Z"
review_passes: 1
handoff_signal_retry_count: 1
dev_error_count: 1
---
## Problem
The Settings pages have many toggles and fields; some may not persist, may accept invalid values, or may be unreachable on a phone.
## Desired UX
Every Settings tab saves, validates with plain-English errors, survives reload and stays usable at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only against fixtures; never open a visible browser or steal focus; never write the real repoos.toml.
- Walk every Settings tab; fix issues with tests.
- Commit docs/qa/2026-11-settings-tabs-qa-2.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T07:17:47Z · created · t@t
- 2026-11-19T07:17:52Z · status inbox→ready
- 2026-11-19T07:17:55Z · status ready→active, branch
- 2026-11-19T07:17:55Z · note: agent fallback: codex + gpt-6-luna is paused (out of usage since 2026-11-19T07:09:32.657Z: Codex hit a provider quota or rate limit. Wait for the provider limit to reset, then retry. (CLI: error: You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purcha) — using opencode + opencode-go/glm-5.3-flash
- 2026-11-19T07:29:45Z · message_queued at 2026-11-19T07:29:45.793Z
- 2026-11-19T07:29:46Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-19T07:32:51Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-19T07:32:51Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: Let me write the full script properly: · stderr: (empty)
- 2026-11-19T07:32:52Z · message_delivered: 1 message(s)
- 2026-11-19T07:32:54Z · message_queued at 2026-11-19T07:32:54.619Z
- 2026-11-19T07:32:54Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-19T07:36:07Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-19T07:36:07Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: Let me write the full script properly: · stderr: (empty)
- 2026-11-19T07:36:08Z · message_delivered: 1 message(s)
- 2026-11-19T07:37:54Z · message_queued at 2026-11-19T07:37:54.641Z
- 2026-11-19T07:37:54Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-19T07:39:34Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-19T07:41:07Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-19T07:41:08Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: Now run the layout walk alone first — it should be quick: · stderr: (empty)
- 2026-11-19T07:41:08Z · message_delivered: 1 message(s)
- 2026-11-19T07:42:54Z · message_queued at 2026-11-19T07:42:54.646Z
- 2026-11-19T07:42:54Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-19T07:47:48Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-19T07:55:29Z · queued message undelivered for 13m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-19T07:55:29Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: Those three timeouts are hidden/disabled fields (`v-show` panels keep all tabs' controls in the DOM, so my enumeration included invisible ones). Fill timeouts on non-editable fields = skip, not failure. Let me wait for the audit to finish: · stderr: (empty)
- 2026-11-19T07:55:30Z · message_delivered: 1 message(s)
- 2026-11-19T07:57:57Z · message_queued at 2026-11-19T07:57:57.308Z
- 2026-11-19T07:57:57Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-19T08:00:59Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-19T08:00:59Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: Killed. Now the corrected audit — visible controls only, instant skip of disabled fields: · stderr: (empty)
- 2026-11-19T08:01:00Z · message_delivered: 1 message(s)
- 2026-11-19T08:02:57Z · message_queued at 2026-11-19T08:02:57.135Z
- 2026-11-19T08:02:57Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-19T08:05:59Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-19T08:05:59Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: Killed. Now the corrected audit — visible controls only, instant skip of disabled fields: · stderr: (empty)
- 2026-11-19T08:06:00Z · message_delivered: 1 message(s)
- 2026-11-19T08:07:57Z · message_queued at 2026-11-19T08:07:57.161Z
- 2026-11-19T08:07:57Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-19T08:08:41Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-19T08:11:31Z · queued message undelivered for 4m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-19T08:11:31Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: All 27 controls so far restore correctly and show proper range errors. The audit needs a few more minutes — I'll let the background completion notification resume me. · stderr: (empty)
- 2026-11-19T08:15:53Z · message_delivered: 1 message(s)
- 2026-11-19T08:15:57Z · message_queued at 2026-11-19T08:15:57.732Z
- 2026-11-19T08:15:58Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-19T08:17:57Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-19T08:20:31Z · queued message undelivered for 5m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-19T08:20:31Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: Pace is right now (53 done in ~3.5 min, all passing). Letting it finish — the completion notification will resume me. · stderr: (empty)
- 2026-11-19T08:20:32Z · message_delivered: 1 message(s)
- 2026-11-19T08:21:55Z · message_queued at 2026-11-19T08:21:55.984Z
- 2026-11-19T08:21:56Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-19T08:22:29Z · note: stopped orphaned engineer pid 91480
- 2026-11-19T08:22:30Z · note: stopped orphaned engineer pid 91480
- 2026-11-19T08:22:32Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-11-19T08:22:33Z · engineer crash recovery: resuming opencode + opencode-go/glm-5.3-flash (1/3 crashes in 30m) · the agent process exited with an error — open the task to see the full output. Open Raw CLI error for details. (CLI: the agent process exited with an error — open the task to see the full output)
- 2026-11-19T08:22:41Z · needs_input
- 2026-11-19T08:22:41Z · message_delivered: 1 message(s)
- 2026-11-19T08:27:26Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-19T08:35:38Z · orphaned run process stopped · pid 75340 · /opt/homebrew/bin/bun -e process.on("exit",c=>console.error("exitcode",c)); import("./docs/qa/settin · cpu 2s · age 2m
- 2026-11-19T09:08:42Z · message_queued at 2026-11-19T09:08:42.980Z
- 2026-11-19T09:10:19Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-19T09:11:50Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-19T09:11:51Z · message_delivered: 1 message(s)
- 2026-11-19T09:15:08Z · status active→review
- 2026-11-19T09:15:08Z · message_queued at 2026-11-19T09:15:08.623Z
- 2026-11-19T09:15:08Z · note: shots: skipped — the diff (10 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-19T09:16:06Z · note: review pass 1: good to go
- 2026-11-19T09:33:54Z · close-out gate completed in 69s
- 2026-11-19T09:33:57Z · status done→done, release:success
