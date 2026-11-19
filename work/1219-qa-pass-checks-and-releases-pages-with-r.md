---
id: "1219"
title: "QA pass: Checks and Releases pages with real data at all screen sizes"
type: bug
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-19T06:17:33Z"
updated_at: "2026-11-19T06:17:33Z"
---
## Problem
The Checks and Releases pages have not been checked with long lists, long names and slow data at phone, tablet and desktop widths.
## Desired UX
Long titles, many rows and slow loads stay readable and usable at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only; never open a visible browser or steal focus.
- Use fixtures with long and many rows; fix truncation, overflow and dead controls with tests.
- Commit docs/qa/2026-11-checks-releases-data-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T06:17:33Z · created · t@t
