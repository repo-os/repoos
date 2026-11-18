---
id: "1196"
title: "QA pass: update and restart flow end to end on service-managed and hand-run servers (follow-up to #1185)"
type: bug
status: done
priority: p2
area: [web, server]
merged_commit: 6f82f70ee9aa6ef3b098f0b3e58f39c935ba173a
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-update-and-restart-flow-end-to-e
created_at: "2026-11-18T19:23:55Z"
updated_at: "2026-11-18T19:54:20Z"
last_close_out_gate_ms: 110609
last_close_out_gate_at: "2026-11-18T19:49:18.985Z"
review_passes: 1
---
## Problem
#1185 fixed supervisor detection; the whole update, restart and reconnect flow still needs an end to end check using fixtures.
## Desired UX
Update notice, Restart now and Restart when idle behave correctly for hand-run, systemd, launchd and uncertain servers, including failures.
## Acceptance criteria
- Headless Playwright only against the auth-less dev server (just serve-noauth from a scratch worktree); never open a visible browser or the user's Chrome. Fix bugs with tests.
- Commit docs/qa/2026-11-restart-flow-e2e.md.
## Notes for AI
Do not touch repoos.toml. Never open a visible browser window.

## Activity

- 2026-11-18T19:23:55Z · created · t@t
- 2026-11-18T19:23:58Z · status inbox→ready
- 2026-11-18T19:24:00Z · status ready→active, branch
- 2026-11-18T19:37:07Z · body
- 2026-11-18T19:39:59Z · body
- 2026-11-18T19:43:19Z · CTO nudge: held — handoff gate is running
- 2026-11-18T19:45:10Z · note: ui verification passed: 1 shot captured with clean console
- 2026-11-18T19:45:11Z · status active→review
- 2026-11-18T19:45:11Z · message_queued at 2026-11-18T19:45:11.783Z
- 2026-11-18T19:45:54Z · note: review pass 1: good to go
- 2026-11-18T19:49:18Z · close-out gate completed in 111s
- 2026-11-18T19:49:49Z · status done→done, release:success
- 2026-11-18T19:54:20Z · message_dropped: 1 queued message(s) discarded — task is done
