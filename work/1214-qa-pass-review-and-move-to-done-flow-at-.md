---
id: "1214"
title: "QA pass: review and Move to done flow at phone, tablet and desktop widths"
type: bug
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-19T02:18:22Z"
updated_at: "2026-11-19T02:18:22Z"
---
## Problem
The review and Move to done flow (task drawer, review verdicts, landable checklist, close-out errors) has not had a QA pass at phone width or with failure states.
## Desired UX
Every review/close-out state reads clearly and every button is reachable and tappable at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only; never open a visible browser.
- Check the drawer in review, needs-input, closing-out, failed close-out and landed states using fixtures; fix layout, wording and dead buttons with tests.
- Commit docs/qa/2026-11-review-flow-qa.md listing what was checked.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T02:18:22Z · created · t@t
