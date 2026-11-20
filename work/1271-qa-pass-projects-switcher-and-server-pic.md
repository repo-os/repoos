---
id: "1271"
title: "QA pass: Projects switcher and server picker flows"
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-projects-switcher-and-server-pic
cli_override: claude code
model_override: haiku
created_at: "2026-11-20T06:07:22Z"
updated_at: "2026-11-20T09:44:54Z"
review_passes: 1
---
## Problem
Sweep the project switcher and server picker (add, switch, offline and error states) for layout, wording and state bugs.

## Desired UX
Flows look and behave correctly at 375, 768 and 1280 widths: no overflow, clear labels, sensible empty, loading and error states, visible keyboard focus.

## Acceptance criteria
- Walked headlessly (Playwright only, never a visible browser) at the three widths.
- Every issue found is fixed, covering the whole class of the problem.
- Scoped check passes once, then hand off.

## Notes for AI
Keep changes small. Never touch repoos.toml. Never open a visible browser.

## Activity

- 2026-11-20T06:07:22Z · created · t@t
- 2026-11-20T06:07:27Z · status inbox→ready
- 2026-11-20T06:07:29Z · cli_override, model_override
- 2026-11-20T06:07:30Z · status ready→active, branch
- 2026-11-20T06:25:44Z · body
- 2026-11-20T06:27:03Z · CTO nudge: held — handoff gate is running
- 2026-11-20T06:27:25Z · status active→review
- 2026-11-20T06:27:25Z · message_queued at 2026-11-20T06:27:25.704Z
- 2026-11-20T06:27:25Z · note: shots: skipped — the diff (4 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-20T06:27:56Z · note: review pass 1: good to go
- 2026-11-20T07:40:40Z · message_overdue: still queued after 60m without being delivered
- 2026-11-20T09:44:54Z · status review→active
- 2026-11-20T09:44:54Z · note: close-out repair: gate-failure
