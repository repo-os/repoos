---
id: "1170"
title: "QA pass: web app mobile widths (375/768) across Work, Releases, Settings, Agents, Checks"
type: bug
status: review
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-web-app-mobile-widths-375-768-ac
cli_override: claude code
model_override: haiku
created_at: "2026-11-18T02:19:49Z"
updated_at: "2026-11-18T03:08:12Z"
review_rounds: 1
review_passes: 1
---
## Problem
Mobile-width layout regressions are likely after recent UI changes.
## Desired UX
No horizontal scroll, clipped buttons, unreachable controls or overlapping drawers at 375px and 768px.
## Acceptance criteria
- Drive the auth-less dev server (just serve-noauth from a worktree) at 375 and 768 widths on the main pages.
- Fix issues found with tests; skip what #1157 already fixed.
- Commit docs/qa/2026-11-web-mobile-widths.md with findings.
## Notes for AI
Do not touch repoos.toml. Pages use full .main width.

## Activity

- 2026-11-18T02:19:49Z · created · t@t
- 2026-11-18T02:20:25Z · status inbox→ready
- 2026-11-18T02:20:30Z · cli_override, model_override
- 2026-11-18T02:20:33Z · status ready→active, branch
- 2026-11-18T02:41:04Z · body
- 2026-11-18T02:43:31Z · CTO nudge: held — handoff gate is running
- 2026-11-18T02:50:46Z · note: ui verification passed: 1 shot captured with clean console
- 2026-11-18T02:50:49Z · status active→review
- 2026-11-18T02:50:49Z · message_queued at 2026-11-18T02:50:49.631Z
- 2026-11-18T02:58:21Z · note: review pass 1: needs some work
- 2026-11-18T02:58:21Z · status review→active
- 2026-11-18T02:58:25Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-18T03:00:31Z · message_delivered: 1 message(s)
- 2026-11-18T03:04:30Z · body
- 2026-11-18T03:08:10Z · note: ui verification passed: 1 shot captured with clean console
- 2026-11-18T03:08:12Z · status active→review
