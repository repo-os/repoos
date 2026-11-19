---
id: "1222"
title: "QA pass: every Settings tab saves, validates and fits small screens (round 2)"
type: bug
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-19T07:17:47Z"
updated_at: "2026-11-19T07:17:47Z"
---
## Problem
The Settings pages have many toggles and fields; some may not persist, may accept invalid values, or may be unreachable on a phone.
## Desired UX
Every Settings tab saves, validates with plain-English errors, survives reload and stays usable at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only against fixtures; never open a visible browser or steal focus; never write the real repoos.toml.
- Walk every Settings tab; fix issues with tests.
- Commit docs/qa/2026-11-settings-tabs-qa-2.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T07:17:47Z · created · t@t
