---
id: "1247"
title: "QA pass: Checks page live run view and cancel/retry controls"
type: bug
status: done
priority: p2
area: web
merged_commit: 4ebcbb3a2cb763c84e7417b207fd2da41a915438
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-checks-page-live-run-view-and-ca
cli_override: claude code
model_override: haiku
created_at: "2026-11-19T21:07:03Z"
updated_at: "2026-11-19T22:04:03Z"
last_close_out_gate_ms: 1070526
last_close_out_gate_at: "2026-11-19T22:01:40.594Z"
review_passes: 1
---
## Problem
The live check run view, cancel and retry controls have not been checked for running, queued, stalled and failed runs at phone widths.
## Desired UX
Each run state is clear in plain English, cancel and retry work and confirm what they did, and output stays inside its own box at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only against fixtures; never open a visible browser or start a real check run.
- Fix issues with tests; commit docs/qa/2026-11-checks-live-run-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T21:07:03Z · created · t@t
- 2026-11-19T21:07:08Z · status inbox→ready
- 2026-11-19T21:07:09Z · cli_override, model_override
- 2026-11-19T21:07:10Z · status ready→active, branch
- 2026-11-19T21:17:35Z · body
- 2026-11-19T21:20:59Z · note: adopted orphaned engineer pid 30233
- 2026-11-19T21:21:54Z · body
- 2026-11-19T21:25:58Z · CTO nudge: held — handoff gate is running
- 2026-11-19T21:36:42Z · note: ui verification passed: 1 shot captured with clean console
- 2026-11-19T21:36:43Z · status active→review
- 2026-11-19T21:36:43Z · message_queued at 2026-11-19T21:36:43.580Z
- 2026-11-19T21:38:45Z · note: review pass 1: good to go
- 2026-11-19T22:01:40Z · close-out gate completed in 1071s
- 2026-11-19T22:02:16Z · status done→done, release:success
- 2026-11-19T22:04:03Z · message_dropped: 1 queued message(s) discarded — task is done
