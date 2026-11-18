---
id: "1182"
title: "QA pass: Android Hub web UI second pass – settings, add-server and error flows at 360px"
type: bug
status: done
priority: p2
area: mobile
merged_commit: c3adf554c7ad6f9b0054958b3758be8633589626
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-android-hub-web-ui-second-pass-s
created_at: "2026-11-18T09:17:43Z"
updated_at: "2026-11-18T10:10:47Z"
last_close_out_gate_ms: 79724
last_close_out_gate_at: "2026-11-18T10:10:41.332Z"
review_passes: 3
handoff_signal_retry_count: 2
review_rounds: 2
routing_switches: 1
routing_escalations: 1
---
## Problem
#1171 covered the main fixtures; add-server, settings and failure flows need another hands-on pass.
## Desired UX
Add-server, edit-server, settings, lock and offline flows look right at 360px and 412px with no clipped controls.
## Acceptance criteria
- Run bunx vite --port 5188 in mobile/ and drive these flows via fixtures; fix bugs with tests.
- Commit docs/qa/2026-11-android-hub-second-pass.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-18T09:17:43Z · created · t@t
- 2026-11-18T09:17:50Z · status inbox→ready
- 2026-11-18T09:17:54Z · status ready→active, branch
- 2026-11-18T09:24:38Z · body
- 2026-11-18T09:26:58Z · body
- 2026-11-18T09:27:32Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: Completed the fixture QA pass. The sweep now covers 360px and 412px, and **47/47 checks passed**. The mobile build and `REPOOS_CHECK_CHANGED=main repoos check` also passed. No layout defect was reproduced, so I changed the QA coverage rath… · stderr: Reading additional input from stdin... 2026-11-18T09:22:23.464346Z ERROR codex_core::tools::router: error=apply_patch verification failed: Failed to find expected lines in /Users/nick/code/nick/repoos-worktrees/feat/qa-pass-android-hub-web-ui-second-pass-s/docs/qa/2026-11-android-hub-second-pass.md: The persistent swe…
- 2026-11-18T09:33:10Z · status active→review
- 2026-11-18T09:33:10Z · message_queued at 2026-11-18T09:33:10.327Z
- 2026-11-18T09:33:10Z · note: shots: skipped — the diff (4 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-18T09:33:52Z · note: review pass 1: needs some work
- 2026-11-18T09:33:53Z · message_delivered: 1 message(s)
- 2026-11-18T09:33:53Z · status review→active
- 2026-11-18T09:38:47Z · body
- 2026-11-18T09:39:51Z · CTO nudge: held — handoff gate is running
- 2026-11-18T09:54:21Z · status active→review
- 2026-11-18T09:54:21Z · message_queued at 2026-11-18T09:54:21.894Z
- 2026-11-18T09:54:22Z · note: shots: skipped — the diff (9 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-18T09:55:05Z · note: review pass 2: needs some work
- 2026-11-18T09:55:06Z · message_delivered: 1 message(s)
- 2026-11-18T09:55:06Z · status review→active
- 2026-11-18T10:00:16Z · body
- 2026-11-18T10:06:49Z · status active→review
- 2026-11-18T10:06:50Z · message_queued at 2026-11-18T10:06:50.017Z
- 2026-11-18T10:06:50Z · note: shots: skipped — the diff (12 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-18T10:07:17Z · note: review pass 3: good to go
- 2026-11-18T10:10:41Z · close-out gate completed in 80s
- 2026-11-18T10:10:47Z · status done→done, release:success
