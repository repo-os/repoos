---
id: "1256"
title: "QA pass: remote runners page add, test and remove flows with failures"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-remote-runners-page-add-test-and
cli_override: claude code
model_override: haiku
created_at: "2026-11-20T00:07:05Z"
updated_at: "2026-11-20T00:42:38Z"
review_rounds: 1
review_passes: 1
---
## Problem
Adding, testing and removing a remote runner has not been checked for unreachable hosts, wrong users, missing CLIs and slow responses.
## Desired UX
Each failure says what went wrong and what to do next in plain English; remove asks for confirmation; works at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only against fixtures; read-only: no ssh and no change to any real runner; never open a visible browser.
- Fix issues with tests; commit docs/qa/2026-11-runner-flows-failures-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-20T00:07:05Z · created · t@t
- 2026-11-20T00:07:14Z · status inbox→ready
- 2026-11-20T00:07:18Z · cli_override, model_override
- 2026-11-20T00:07:19Z · status ready→active, branch
- 2026-11-20T00:17:10Z · note: adopted orphaned engineer pid 44870
- 2026-11-20T00:24:04Z · body
- 2026-11-20T00:27:07Z · CTO nudge: held — handoff gate is running
- 2026-11-20T00:40:51Z · note: ui verification passed: 1 shot captured with clean console
- 2026-11-20T00:40:57Z · status active→review
- 2026-11-20T00:40:59Z · message_queued at 2026-11-20T00:40:59.181Z
- 2026-11-20T00:42:37Z · note: review pass 1: needs some work
- 2026-11-20T00:42:38Z · status review→active
