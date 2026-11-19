---
id: "1235"
title: "QA pass: Work board drag, status moves and bulk actions with failures"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-work-board-drag-status-moves-and
created_at: "2026-11-19T16:17:45Z"
updated_at: "2026-11-19T16:17:50Z"
---
## Problem
Status changes, drag/drop and bulk actions on the Work board have not been tested when the server rejects them (blocked move, dirty main, conflict).
## Desired UX
A rejected move snaps back and shows a plain-English reason with the next step; nothing is left half-moved at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only against fixtures and mocked rejections; never open a visible browser or steal focus.
- Cover blocked, failed and slow moves, and keyboard/touch alternatives to drag; fix issues with tests.
- Commit docs/qa/2026-11-board-moves-failures-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T16:17:45Z · created · t@t
- 2026-11-19T16:17:49Z · status inbox→ready
- 2026-11-19T16:17:50Z · status ready→active, branch
- 2026-11-19T16:17:50Z · note: agent fallback: codex + gpt-6-luna is paused (out of usage since 2026-11-19T07:09:32.657Z: Codex hit a provider quota or rate limit. Wait for the provider limit to reset, then retry. (CLI: error: You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purcha) — using opencode + opencode-go/glm-5.3-flash
