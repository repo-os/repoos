---
id: "0269"
title: "Preview start: unreliable, unhelpful errors, no loading indicator"
type: bug
status: inbox
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: ""
model_override: default
pm_model_override: deepinfra/deepseek-ai/DeepSeek-V4-Pro-0813
created_at: "2026-08-24T15:55:33Z"
updated_at: "2026-08-24T17:47:54Z"
---
## Problem
Clicking "start preview" on a reviewed task failed with an unhelpful error (something about the preview server not becoming ready, suggesting a rebuild) with no actionable detail on why. Also, clicking the button gives no feedback for ~10 seconds before anything visibly happens.

## Fix
- Make preview start failures return an actionable, specific error (what failed, what to do).
- Investigate why preview start is unreliable in the first place — it should work consistently.
- Add a loading indicator (spinner/animation) immediately on click, since the operation visibly takes ~10s.

See src/server/preview.ts and the task drawer's preview UI.

## Activity

- 2026-08-24T15:58:45Z · body
- 2026-08-24T17:28:50Z · pm_model_override
- 2026-08-24T17:31:01Z · model_override
- 2026-08-24T17:32:45Z · pm_model_override
- 2026-08-24T17:32:57Z · pm_model_override
- 2026-08-24T17:47:54Z · pm_model_override
