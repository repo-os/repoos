---
id: "1171"
title: "QA pass: Android Hub web UI fixtures (many servers, errors, offline) and fix issues"
type: bug
status: inbox
priority: p2
area: mobile
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-18T02:19:54Z"
updated_at: "2026-11-18T02:19:54Z"
---
## Problem
The Android Hub Vite UI needs a fixture-driven QA sweep before device QA (#1162).
## Desired UX
Server picker, project list, error and offline states look correct at phone widths.
## Acceptance criteria
- Run bunx vite --port 5188 in mobile/ and open ?fixture=many&platform=android plus error/offline fixtures at 375px.
- Fix layout/state bugs found with tests.
- Commit docs/qa/2026-11-android-hub-fixtures.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-18T02:19:54Z · created · t@t
