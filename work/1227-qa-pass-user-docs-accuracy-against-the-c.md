---
id: "1227"
title: "QA pass: user-docs accuracy against the current UI and CLI"
type: bug
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-19T09:47:43Z"
updated_at: "2026-11-19T09:47:43Z"
---
## Problem
user-docs/ may describe screens, tab names, CLI flags and defaults that changed in recent releases.
## Desired UX
A new user following user-docs finds every screen, button, command and default exactly as described.
## Acceptance criteria
- Compare user-docs against `repoos --help` output, getConfigSchema() and current UI labels; fix stale text, scoped to what actually changed since v0.5.89.
- No ssh and no changes to any runner; headless only if the UI is touched.
- Commit docs/qa/2026-11-user-docs-accuracy-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T09:47:43Z · created · t@t
