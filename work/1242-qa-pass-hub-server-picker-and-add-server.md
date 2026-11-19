---
id: "1242"
title: "QA pass: Hub server picker and add-server flow copy and error states"
type: bug
status: review
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-hub-server-picker-and-add-server
cli_override: claude code
model_override: haiku
created_at: "2026-11-19T19:07:19Z"
updated_at: "2026-11-19T19:30:47Z"
---
## Problem
The Hub server picker and add-server flow need a final check of wording and error states (bad URL, unreachable server, duplicate name, unsafe scheme) in the web preview of the shell.
## Desired UX
Every error says what is wrong and what to do next in plain English; the flow works at phone and tablet widths.
## Acceptance criteria
- Headless Playwright only against fixtures; never open a visible browser; no real servers contacted.
- Cover bad URL, http/file/javascript schemes, duplicate, unreachable and slow servers; fix issues with tests.
- Commit docs/qa/2026-11-hub-picker-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T19:07:19Z · created · t@t
- 2026-11-19T19:07:24Z · status inbox→ready
- 2026-11-19T19:07:25Z · cli_override, model_override
- 2026-11-19T19:07:26Z · status ready→active, branch
- 2026-11-19T19:30:47Z · status active→review
