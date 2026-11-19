---
id: "1251"
title: "QA pass: Work board in a project with hundreds of tasks (performance and scroll)"
type: bug
status: ready
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: ""
cli_override: claude code
model_override: haiku
created_at: "2026-11-19T22:26:56Z"
updated_at: "2026-11-19T22:27:03Z"
---
## Problem
The Work board and Done column with 1000+ tasks have not been checked for scroll, filter and render speed, especially on phones.
## Desired UX
The board opens quickly, scrolls smoothly, filters respond immediately and the Done column loads in pages or windows at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only against a large generated fixture; never open a visible browser or steal focus.
- Measure render and filter time; fix the worst slowdowns or layout jumps with tests and record numbers.
- Commit docs/qa/2026-11-large-board-perf-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T22:26:56Z · created · t@t
- 2026-11-19T22:27:01Z · status inbox→ready
- 2026-11-19T22:27:03Z · cli_override, model_override
