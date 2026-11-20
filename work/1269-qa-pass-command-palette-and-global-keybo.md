---
id: "1269"
title: "QA pass: command palette and global keyboard shortcuts"
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-command-palette-and-global-keybo
cli_override: claude code
model_override: haiku
created_at: "2026-11-20T05:08:53Z"
updated_at: "2026-11-20T05:42:36Z"
---
## Problem
Sweep the command palette and keyboard shortcuts for focus, wording, mobile and screen-reader bugs.

## Desired UX
Pages look and behave correctly at 375, 768 and 1280 widths: no overflow, clear labels, sensible empty, loading and error states, visible keyboard focus.

## Acceptance criteria
- Walked headlessly (Playwright only, never a visible browser) at the three widths.
- Every issue found is fixed, covering the whole class of the problem.
- Scoped check passes once, then hand off.

## Notes for AI
Keep changes small. Never touch repoos.toml. Never open a visible browser.

## Activity

- 2026-11-20T05:08:53Z · created · t@t
- 2026-11-20T05:09:22Z · status inbox→ready
- 2026-11-20T05:09:31Z · cli_override, model_override
- 2026-11-20T05:09:38Z · status ready→active, branch
- 2026-11-20T05:42:27Z · message_queued at 2026-11-20T05:42:27.781Z
- 2026-11-20T05:42:27Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-20T05:42:36Z · body
