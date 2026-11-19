---
id: "1241"
title: "QA pass: Agents page Build Your Team and scheduled tasks with long lists"
type: bug
status: done
priority: p2
area: web
merged_commit: 3d8b6d4b6cf968d41adeb5a55ff75434899da742
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-agents-page-build-your-team-and-
cli_override: claude code
model_override: haiku
created_at: "2026-11-19T19:07:09Z"
updated_at: "2026-11-19T20:21:27Z"
last_close_out_gate_ms: 374650
last_close_out_gate_at: "2026-11-19T20:21:09.311Z"
review_passes: 1
---
## Problem
Build Your Team, Scheduled Tasks and Reminders have not been checked with many entries and long names.
## Desired UX
Long lists and names stay readable, forms validate in plain English, and nothing overflows at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only against fixtures; never open a visible browser or steal focus.
- Use fixtures with 50+ entries and long names; fix issues with tests.
- Commit docs/qa/2026-11-agents-long-lists-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T19:07:09Z · created · t@t
- 2026-11-19T19:07:12Z · status inbox→ready
- 2026-11-19T19:07:14Z · cli_override, model_override
- 2026-11-19T19:07:15Z · status ready→active, branch
- 2026-11-19T19:23:44Z · body
- 2026-11-19T19:29:09Z · CTO nudge: held — handoff gate is running
- 2026-11-19T19:41:19Z · note: ui verification passed: 1 shot captured with clean console
- 2026-11-19T19:41:19Z · status active→review
- 2026-11-19T19:41:20Z · message_queued at 2026-11-19T19:41:20.099Z
- 2026-11-19T19:43:12Z · note: review pass 1: good to go
- 2026-11-19T20:21:09Z · close-out gate completed in 375s
- 2026-11-19T20:21:27Z · status done→done, release:success
