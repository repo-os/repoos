---
id: "1250"
title: "QA pass: Hub macOS and web shared strings, tooltips and empty labels audit"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-hub-macos-and-web-shared-strings
cli_override: claude code
model_override: haiku
created_at: "2026-11-19T21:47:05Z"
updated_at: "2026-11-19T22:25:14Z"
review_rounds: 2
review_passes: 2
---
## Problem
Tooltips, aria-labels, placeholders and empty-state labels across the app may be missing, duplicated or inconsistent (for example native title tooltips, which are banned in new UI).
## Desired UX
Every icon-only control has a styled, keyboard-and-touch-usable label, and wording for the same thing is identical everywhere.
## Acceptance criteria
- Scan the UI source for native title attributes, missing aria-labels and inconsistent terms; fix the real ones with tests.
- Headless Playwright only if verifying visually; never open a visible browser.
- Commit docs/qa/2026-11-labels-tooltips-audit-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T21:47:05Z · created · t@t
- 2026-11-19T21:47:10Z · status inbox→ready
- 2026-11-19T21:47:12Z · cli_override, model_override
- 2026-11-19T21:47:13Z · status ready→active, branch
- 2026-11-19T21:56:02Z · body
- 2026-11-19T21:57:45Z · CTO nudge: held — handoff gate is running
- 2026-11-19T21:59:23Z · note: ui verification passed: 1 shot captured with clean console
- 2026-11-19T21:59:25Z · status active→review
- 2026-11-19T21:59:25Z · message_queued at 2026-11-19T21:59:25.449Z
- 2026-11-19T22:01:09Z · note: review pass 1: needs some work
- 2026-11-19T22:01:09Z · message_delivered: 1 message(s)
- 2026-11-19T22:01:09Z · status review→active
- 2026-11-19T22:10:34Z · body
- 2026-11-19T22:12:45Z · CTO nudge: held — handoff gate is running
- 2026-11-19T22:13:55Z · note: ui verification passed: 1 shot captured with clean console
- 2026-11-19T22:13:56Z · status active→review
- 2026-11-19T22:13:56Z · message_queued at 2026-11-19T22:13:56.413Z
- 2026-11-19T22:15:04Z · note: review pass 2: needs some work
- 2026-11-19T22:15:04Z · message_delivered: 1 message(s)
- 2026-11-19T22:15:04Z · status review→active
- 2026-11-19T22:15:07Z · CTO nudge: held — remote validation is running
- 2026-11-19T22:21:31Z · body
- 2026-11-19T22:22:45Z · CTO nudge: held — handoff gate is running
- 2026-11-19T22:25:14Z · note: ui verification passed: 1 shot captured with clean console
