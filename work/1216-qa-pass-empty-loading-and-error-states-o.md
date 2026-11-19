---
updated_at: "2026-11-19T03:43:28Z"
review_passes: 1
id: "1216"
title: "QA pass: empty, loading and error states on Agents, Checks and Releases"
type: bug
status: review
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-empty-loading-and-error-states-o
created_at: "2026-11-19T03:17:43Z"
---
## Problem
The Agents, Checks and Releases pages have not been re-checked since the latest releases for empty, loading and error states.
## Desired UX
Each page shows a clear plain-English empty, loading and error state and stays usable at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only; never open a visible browser.
- Check each state using fixtures; fix issues with tests.
- Commit docs/qa/2026-11-empty-error-states-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T03:17:43Z · created · t@t
- 2026-11-19T03:17:48Z · status inbox→ready
- 2026-11-19T03:17:50Z · status ready→active, branch
- 2026-11-19T03:23:21Z · body
- 2026-11-19T03:28:11Z · CTO nudge: held — handoff gate is running
- 2026-11-19T03:42:40Z · note: ui verification passed: 1 shot captured with clean console
- 2026-11-19T03:42:42Z · status active→review
- 2026-11-19T03:42:43Z · message_queued at 2026-11-19T03:42:43.120Z
- 2026-11-19T03:43:27Z · note: review pass 1: needs some work

