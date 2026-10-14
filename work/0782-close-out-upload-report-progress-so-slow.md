---
id: "0782"
title: "Close-out upload: report progress so slow uploads are not flagged as stalled"
type: bug
status: ready
priority: p3
area: [server, web]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/close-out-upload-report-progress-so-slow
model_override: opencode/muse-spark-1.3-contributor-free
created_at: "2026-10-14T10:35:08Z"
updated_at: "2026-10-14T13:24:13Z"
---
## Problem
The close-out card shows 'stalled · no progress' when a job is still moving. On 2026-10-14, #0777's bundle upload to bee took 228s (27 MB). The upload step reports no stage progress while it runs, so after 3 minutes the UI labels the job stalled, even though the job completed and the bee tests then started. The stall label is computed in src/ui-app/src/lib/integration-pipeline-ui.ts from the job's last progress time (DEFAULT_INTEGRATION_STALL_MS, 3 minutes).

## Desired UX
- During the upload, the job reports progress (for example bytes sent, updated every few seconds), so the stall timer resets while data is moving.
- 'Stalled' only shows when nothing has moved for the threshold.
- The card shows the upload progress while it runs, so a slow network is visible rather than mistaken for a hang.

## Acceptance criteria
- Test: a job whose upload reports progress every few seconds is not labelled stalled, even when the upload takes longer than 3 minutes.
- Test: a job with no progress for the threshold is still labelled stalled.
- Upload progress is visible on the card in light and dark themes.

## Notes for AI
Start from the remote validation upload in the integration orchestrator (src/server/integration-orchestrator.ts; the bee bundle upload logs 'uploaded bundle ... in Ns') and integrationIdleMs / integrationPipelineStalled in the UI lib. Source: user question on 2026-10-14 about #0777.

## Activity

- 2026-10-14T10:35:08Z · created · njachowski@gmail.com
- 2026-10-14T10:54:04Z · model_override
- 2026-10-14T10:54:05Z · status inbox→ready
- 2026-10-14T10:54:06Z · status ready→active, branch
- 2026-10-14T11:14:53Z · status active→review
- 2026-10-14T12:08:27Z · status review→active
- 2026-10-14T13:15:30Z · watchdog: auto-surfaced stuck task · status active→ready · agent never started — no session exists for this task · next step: resume the session manually from the task's worktree and check for uncommitted work
- 2026-10-14T13:24:12Z · status ready→review
- 2026-10-14T13:24:12Z · note: handoff requested (cli)
- 2026-10-14T13:24:13Z · handoff failed · task-file handoff failed at validate · task must be active or review, but is ready
