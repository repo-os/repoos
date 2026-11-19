---
id: "1232"
title: "Easter eggs bundle: task action button labels (Delete, Archive, Hold)"
type: chore
status: active
needs_input: true
needs_input_reason: dev-error
needs_input_detail: the agent process exited with an error — open the task to see the full output
priority: p3
area: web
assigned_to: ai
created_by: t@t
branch: feat/easter-eggs-bundle-task-action-button-la
created_at: "2026-11-19T13:54:07Z"
updated_at: "2026-11-19T14:51:58Z"
dev_error_count: 1
engineer_crash_log: "[{\"cli\":\"opencode\",\"model\":\"opencode-go/glm-5.3-flash\",\"at\":\"2026-11-19T14:51:58.346Z\",\"kind\":\"dev-error\"}]"
---
## Problem
The task drawer footer buttons read "Delete task", "Archive task" and "Hold". The word "task" is redundant (the drawer is already a task) and the three are inconsistent.
## Desired UX
The drawer footer buttons read exactly "Delete", "Archive" and "Hold" (and "Release hold" when held, "Unarchive" when archived). The confirmation dialogs keep clear wording, and their confirm buttons also drop the word task ("Delete", "Archive", "Hold") while their titles stay "Delete task?", "Archive task?", "Hold task".
## Acceptance criteria
- Update src/ui-app/src/components/TaskDrawer.vue (around lines 6775-6794), DeleteTaskDialog.vue, ArchiveTaskDialog.vue and HoldTaskDialog.vue confirm buttons, and any other task-action button using the same labels.
- Update tests, docs and user-docs that quote the old labels (grep "Delete task", "Archive task").
- Headless Playwright only if verifying visually; never open a visible browser.
## Notes for AI
Do not touch repoos.toml. Keep aria-labels descriptive (e.g. aria-label "Delete task") so screen-reader users still hear what is affected.

## Activity

- 2026-11-19T13:54:07Z · created · t@t
- 2026-11-19T13:54:25Z · title
- 2026-11-19T14:47:34Z · status inbox→ready
- 2026-11-19T14:47:36Z · status ready→active, branch
- 2026-11-19T14:47:36Z · note: agent fallback: codex + gpt-6-luna is paused (out of usage since 2026-11-19T07:09:32.657Z: Codex hit a provider quota or rate limit. Wait for the provider limit to reset, then retry. (CLI: error: You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purcha) — using opencode + opencode-go/glm-5.3-flash
- 2026-11-19T14:51:58Z · note: stopped orphaned engineer pid 34587
- 2026-11-19T14:51:58Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-11-19T14:51:58Z · engineer crash recovery: resuming opencode + opencode-go/glm-5.3-flash (1/3 crashes in 30m) · the agent process exited with an error — open the task to see the full output. Open Raw CLI error for details. (CLI: the agent process exited with an error — open the task to see the full output)
