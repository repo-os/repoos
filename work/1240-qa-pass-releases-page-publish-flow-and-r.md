---
last_close_out_gate_ms: 284037
last_close_out_gate_at: "2026-11-19T19:03:52.807Z"
id: "1240"
title: "QA pass: Releases page publish flow and release notes editor with failures"
type: bug
status: review
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-releases-page-publish-flow-and-r
cli_override: claude code
model_override: haiku
created_at: "2026-11-19T18:27:27Z"
updated_at: "2026-11-19T19:03:52Z"
review_passes: 1
---
## Problem
The Releases page publish flow and notes editor have not been tested for failures (CI failing, tag exists, long notes, offline).
## Desired UX
Every failure says what happened and what to do next in plain English, notes can be edited and saved at 375, 768 and 1280 px, and nothing is published by accident.
## Acceptance criteria
- Headless Playwright only against fixtures; never run a real release; never open a visible browser.
- Cover failure and long-content states; fix issues with tests.
- Commit docs/qa/2026-11-release-flow-failures-qa.md.
## Notes for AI
Do not touch repoos.toml. Do not call the real release API.

## Activity

- 2026-11-19T18:27:27Z · created · t@t
- 2026-11-19T18:27:32Z · status inbox→ready
- 2026-11-19T18:27:34Z · cli_override, model_override
- 2026-11-19T18:27:35Z · status ready→active, branch
- 2026-11-19T18:36:51Z · note: adopted orphaned engineer pid 6052
- 2026-11-19T18:44:15Z · body
- 2026-11-19T18:46:49Z · CTO nudge: held — handoff gate is running
- 2026-11-19T18:47:36Z · note: ui verification passed: 1 shot captured with clean console
- 2026-11-19T18:47:38Z · status active→review
- 2026-11-19T18:47:39Z · message_queued at 2026-11-19T18:47:39.279Z
- 2026-11-19T18:50:02Z · note: review pass 1: good to go
- 2026-11-19T19:03:52Z · close-out gate completed in 284s

