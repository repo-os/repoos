---
id: "1254"
title: "QA pass: Stories page create, link and progress flows at all screen sizes"
type: bug
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-19T23:27:29Z"
updated_at: "2026-11-19T23:27:29Z"
---
## Problem
Creating a story, linking tasks to it and reading its progress have not been exercised end to end with edge cases.
## Desired UX
Story create, link, unlink and progress work with plain-English validation and no dead controls at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only against fixtures; never open a visible browser.
- Cover empty, many-task, duplicate-name and failure cases; fix issues with tests.
- Commit docs/qa/2026-11-story-flows-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T23:27:29Z · created · t@t
