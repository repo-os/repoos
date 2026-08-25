---
id: "0275"
title: "Debugger false could-not-respond error, broken change-agent/model button, Agents page cant set model per agent"
type: bug
status: active
priority: p2
area: agent
assigned_to: ai
created_by: ""
branch: feat/debugger-false-could-not-respond-error-b
model_override: default
pm_model_override: default
review_model_override: default
created_at: "2026-08-24T15:57:09Z"
updated_at: "2026-08-25T16:29:05Z"
---
## Problem
Several related debugger/agent-selection issues seen on the same run:
1. The debugger produced a correct diagnosis ("the task file conflict is routine frontmatter/activity bookkeeping, auto-resolves on retry") but then the run ended with "The Debugger's agent or model could not respond. It may be out of credit, unavailable, or disconnected." — this error appears to fire even when the debugger actually succeeded, so it seems to be a false negative, not a real failure. Reproduces reliably enough to be suspicious.
2. That error's "change agent or model" button doesn't open the model-selection modal (which should be the only way to change agent/model) — it navigates to the Agents page instead.
3. The Agents page ("build your team") doesn't let you set/change a model for the debugger (or most agents there) at all — most agents on that page have no per-agent model control, so even if the button routed correctly there's nowhere to act.

## Fix
- Investigate why the debugger fires a "could not respond" error after apparently succeeding; fix the false negative if that's what it is.
- Fix the "change agent or model" button to open the actual agent/model selection modal.
- Add per-agent model selection to the Agents/"build your team" page for agents that are missing it, including the debugger.

## Activity

- 2026-08-24T15:59:55Z · body
- 2026-08-24T19:55:57Z · status inbox→ready
- 2026-08-25T15:11:13Z · model_override
- 2026-08-25T16:16:43Z · status ready→active, branch
- 2026-08-25T16:29:03Z · review_model_override
- 2026-08-25T16:29:05Z · pm_model_override
