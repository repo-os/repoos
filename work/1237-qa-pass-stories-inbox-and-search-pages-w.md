---
id: "1237"
title: "QA pass: Stories, Inbox and Search pages with many items at all screen sizes"
type: bug
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-19T17:46:51Z"
updated_at: "2026-11-19T17:46:51Z"
---
## Problem
Stories, Inbox and Search have not been checked with many items, long titles and zero results at phone, tablet and desktop widths.
## Desired UX
Lists stay readable and fast to scan, empty and no-result states are plain English, and nothing overflows at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only against fixtures; never open a visible browser or steal focus.
- Use fixtures with 200+ items and long titles; fix overflow, clipped controls and dead links with tests.
- Commit docs/qa/2026-11-stories-inbox-search-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T17:46:51Z · created · t@t
