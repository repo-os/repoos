---
id: "1248"
title: "QA pass: Inputs and Context uploads with large, wrong-type and failing files"
type: bug
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-19T21:26:57Z"
updated_at: "2026-11-19T21:26:57Z"
---
## Problem
Uploads on the Inputs and Context pages have not been checked with very large files, wrong types, duplicate names and failing uploads.
## Desired UX
Every rejected or failed upload says what went wrong and what to do in plain English, progress is visible, and nothing is half-saved at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only against fixtures and mocked responses; never open a visible browser; never commit binaries under work/ or inputs/.
- Fix issues with tests; commit docs/qa/2026-11-uploads-failures-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T21:26:57Z · created · t@t
