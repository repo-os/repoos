---
id: "1232"
title: "Easter eggs bundle: task action button labels (Delete, Archive, Hold)"
type: chore
status: review
priority: p3
area: web
assigned_to: ai
created_by: t@t
branch: feat/easter-eggs-bundle-task-action-button-la
created_at: "2026-11-19T13:54:07Z"
updated_at: "2026-11-19T15:38:51Z"
last_check_failure: "repoos check at 2026-11-19T15:14:43.458Z: repoos check failed: ui verification failed (1 issue(s)): [missing-target] Task drawer footer actions with shortened labels (Delete, Archive, Hold) (target \"default\"): highlight .delete-zone matched nothing on /work?task=0001&tab=details (http://127.0.0.1:40237/work?task=0001&tab=details&shotState=drawer%3AstatusDetails)"
dev_error_count: 1
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

## Shots
```json
[
{
"label": "Task drawer footer actions with shortened labels (Delete, Archive, Hold)",
"target": "default",
"route": "/work?task=9999&tab=details",
"selector": ".delete-zone",
"highlight": ".delete-zone",
"state": "drawer:reviewWithBranch"
}
]
```

## Activity

- 2026-11-19T13:54:07Z · created · t@t
- 2026-11-19T13:54:25Z · title
- 2026-11-19T14:47:34Z · status inbox→ready
- 2026-11-19T14:47:36Z · status ready→active, branch
- 2026-11-19T14:47:36Z · note: agent fallback: codex + gpt-6-luna is paused (out of usage since 2026-11-19T07:09:32.657Z: Codex hit a provider quota or rate limit. Wait for the provider limit to reset, then retry. (CLI: error: You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purcha) — using opencode + opencode-go/glm-5.3-flash
- 2026-11-19T14:51:58Z · note: stopped orphaned engineer pid 34587
- 2026-11-19T14:51:58Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-11-19T14:51:58Z · engineer crash recovery: resuming opencode + opencode-go/glm-5.3-flash (1/3 crashes in 30m) · the agent process exited with an error — open the task to see the full output. Open Raw CLI error for details. (CLI: the agent process exited with an error — open the task to see the full output)
- 2026-11-19T14:53:36Z · body
- 2026-11-19T14:54:49Z · body
- 2026-11-19T14:55:03Z · body
- 2026-11-19T15:05:57Z · watchdog: restarting engineer after 11m with no live process
- 2026-11-19T15:10:47Z · body
- 2026-11-19T15:11:56Z · CTO nudge: held — handoff gate is running
- 2026-11-19T15:14:40Z · note: ui verification failed: ui verification failed (1 issue(s)): [missing-target] Task drawer footer actions with shortened labels (Delete, Archive, Hold) (target "default"): highlight .delete-zone matched nothing on /work?task=0001&tab=details (http://127.0.0.1:40237/work?task=0001&tab=details&shotState=drawer%3AstatusDetails)
- 2026-11-19T15:14:40Z · message_queued at 2026-11-19T15:14:40.346Z
- 2026-11-19T15:14:43Z · message_delivered: 1 message(s)
- 2026-11-19T15:16:15Z · body
- 2026-11-19T15:16:56Z · CTO nudge: held — remote validation is running
- 2026-11-19T15:22:33Z · body
- 2026-11-19T15:26:45Z · body
- 2026-11-19T15:28:21Z · CTO nudge: held — handoff gate is running
- 2026-11-19T15:28:32Z · message_queued at 2026-11-19T15:28:32.699Z
- 2026-11-19T15:31:42Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-19T15:31:44Z · message_delivered: 1 message(s)
- 2026-11-19T15:37:11Z · body
- 2026-11-19T15:38:51Z · status active→review
- 2026-11-19T15:38:51Z · note: shots: skipped — 2 shots already captured — an engineer-made capture pre-empts the automatic one
- 2026-11-19T15:38:51Z · message_queued at 2026-11-19T15:38:51.555Z
- 2026-11-19T15:38:51Z · note: shots: skipped — 2 shots already captured — an engineer-made capture pre-empts the automatic one
