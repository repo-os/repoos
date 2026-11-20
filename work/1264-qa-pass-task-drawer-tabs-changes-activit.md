---
id: "1264"
title: "QA pass: task drawer tabs (changes, activity, reports)"
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-task-drawer-tabs-changes-activit
cli_override: claude code
model_override: haiku
created_at: "2026-11-20T02:27:21Z"
updated_at: "2026-11-20T02:46:58Z"
---
## Problem
Sweep the task drawer tabs for layout, wording, loading and empty-state bugs.

## Desired UX
Pages look and behave correctly at 375, 768 and 1280 widths: no overflow, clear labels, sensible empty, loading and error states, visible keyboard focus.

## Acceptance criteria
- Walked headlessly (Playwright only, never a visible browser) at the three widths.
- Every issue found is fixed, covering the whole class of the problem.
- Scoped check passes once, then hand off.

## Notes for AI
Keep changes small. Never touch repoos.toml. Never open a visible browser.

## Activity

- 2026-11-20T02:27:21Z · created · t@t
- 2026-11-20T02:27:27Z · status inbox→ready
- 2026-11-20T02:27:29Z · cli_override, model_override
- 2026-11-20T02:27:31Z · status ready→active, branch
- 2026-11-20T02:41:16Z · body
- 2026-11-20T02:46:58Z · CTO nudge: held — handoff gate is running
