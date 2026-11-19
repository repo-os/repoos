---
id: "1215"
title: "QA pass: task create and edit flows at all screen sizes"
type: bug
status: review
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-task-create-and-edit-flows-at-al
created_at: "2026-11-19T03:17:33Z"
updated_at: "2026-11-19T03:37:15Z"
handoff_signal_retry_count: 1
---
## Problem
Task creation and editing (new task drawer, edit fields, attachments, screenshots) has not had a QA pass at phone, tablet and desktop widths.
## Desired UX
Every field, validation message and button works and is reachable at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only; never open a visible browser or steal focus.
- Exercise create, edit, depends-on, priority, area and screenshot attach using fixtures; fix layout, wording and dead controls with tests.
- Commit docs/qa/2026-11-task-create-edit-qa.md listing what was checked.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T03:17:33Z · created · t@t
- 2026-11-19T03:17:36Z · status inbox→ready
- 2026-11-19T03:17:38Z · status ready→active, branch
- 2026-11-19T03:22:19Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The tablet viewport was missing from the dependency-picker browser test. I added 768 px, so the headless WebKit test now covers 375, 768 and 1280 px. All three cases passed; the scoped run also passed 99 tests and the build. I documented t… · stderr: Reading additional input from stdin... 2026-11-19T03:22:17.880126Z ERROR codex_core::session: failed to record rollout items: thread 01a1f1cf-5f04-7233-8ce7-0db64e3e6002 not found
- 2026-11-19T03:31:10Z · body
- 2026-11-19T03:35:34Z · body
- 2026-11-19T03:37:15Z · status active→review
