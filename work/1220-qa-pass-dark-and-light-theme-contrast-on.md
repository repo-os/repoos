---
id: "1220"
title: "QA pass: dark and light theme contrast on every main page"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-dark-and-light-theme-contrast-on
created_at: "2026-11-19T06:17:41Z"
updated_at: "2026-11-19T06:22:34Z"
review_rounds: 1
routing_switches: 1
review_passes: 1
---
## Problem
Theme contrast on newer pages and dialogs has not been re-checked since recent UI changes.
## Desired UX
Text, borders, focus rings and status colors are readable in both light and dark themes on every main page and dialog.
## Acceptance criteria
- Headless Playwright only; never open a visible browser or steal focus.
- Run the rendered contrast audit across main pages and dialogs in both themes; fix real failures with tests, using theme tokens not hard-coded colors.
- Commit docs/qa/2026-11-theme-contrast-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T06:17:41Z · created · t@t
- 2026-11-19T06:17:44Z · status inbox→ready
- 2026-11-19T06:17:46Z · status ready→active, branch
- 2026-11-19T06:21:56Z · status active→review
- 2026-11-19T06:21:56Z · message_queued at 2026-11-19T06:21:56.417Z
- 2026-11-19T06:21:57Z · note: shots: skipped — the diff (3 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-19T06:22:33Z · note: review pass 1: needs some work
- 2026-11-19T06:22:34Z · message_delivered: 1 message(s)
- 2026-11-19T06:22:34Z · status review→active
