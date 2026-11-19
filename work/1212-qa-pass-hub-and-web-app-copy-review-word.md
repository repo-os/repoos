---
id: "1212"
title: "QA pass: Hub and web app copy review – wording, plain-English errors and consistent terminology"
type: chore
status: active
priority: p3
area: [web, mobile, macos]
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-hub-and-web-app-copy-review-word
created_at: "2026-11-19T00:47:39Z"
updated_at: "2026-11-19T00:47:44Z"
---
## Problem
Wording across the web app and Hub apps may be inconsistent or jargon-heavy (infra terms in user-facing errors).
## Desired UX
Errors and labels use plain English and consistent names for the same things (server, project, runner, agent).
## Acceptance criteria
- Read UI strings in src/ui-app, mobile/ and macos/; fix the worst jargon and inconsistencies with tests where strings are asserted; headless browsers only, never visible.
- Commit docs/qa/2026-11-copy-review.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T00:47:39Z · created · t@t
- 2026-11-19T00:47:42Z · status inbox→ready
- 2026-11-19T00:47:44Z · status ready→active, branch
