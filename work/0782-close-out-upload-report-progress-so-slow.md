---
id: "0782"
title: "Close-out upload: report progress so slow uploads are not flagged as stalled"
type: bug
status: active
needs_input: true
needs_input_reason: review-rounds-exhausted
needs_input_detail: The reviewer sent this back to the engineer 2 times and still found issues. Human review needed.
priority: p3
area: [server, web]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/close-out-upload-report-progress-so-slow
model_override: opencode/muse-spark-1.3-contributor-free
created_at: "2026-10-14T10:35:08Z"
updated_at: "2026-10-14T11:46:35Z"
review_passes: 3
review_rounds: 2
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

## Shots
```json
[
{
"label": "Board card showing bundle upload progress",
"target": "default",
"route": "/",
"highlight": "[data-test-id=\"task-card-agent-hint\"]",
"state": "closeOut:uploading"
}
]
```

## Activity

- 2026-10-14T10:35:08Z · created · njachowski@gmail.com
- 2026-10-14T10:54:04Z · model_override
- 2026-10-14T10:54:05Z · status inbox→ready
- 2026-10-14T10:54:06Z · status ready→active, branch
- 2026-10-14T10:59:33Z · message_queued at 2026-10-14T10:59:33.423Z
- 2026-10-14T10:59:33Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-14T11:03:16Z · body
- 2026-10-14T11:04:08Z · body
- 2026-10-14T11:06:58Z · body: section Shots
- 2026-10-14T11:08:00Z · body
- 2026-10-14T11:14:53Z · status active→review
- 2026-10-14T11:16:03Z · note: review pass 1: needs some work
- 2026-10-14T11:16:04Z · message_delivered: 1 message(s)
- 2026-10-14T11:16:04Z · status review→active
- 2026-10-14T11:21:03Z · body
- 2026-10-14T11:22:27Z · body
- 2026-10-14T11:29:19Z · status active→review
- 2026-10-14T11:29:19Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (bd296e1a0) during finalization (#0734)
- 2026-10-14T11:29:19Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (bd296e1a0) during finalization (#0734)
- 2026-10-14T11:30:23Z · note: review pass 2: needs some work
- 2026-10-14T11:30:23Z · status review→active
- 2026-10-14T11:35:59Z · body
- 2026-10-14T11:42:54Z · status active→review
- 2026-10-14T11:42:55Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (c5e628250) during finalization (#0734)
- 2026-10-14T11:42:55Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (c5e628250) during finalization (#0734)
- 2026-10-14T11:43:59Z · note: review pass 3: needs some work
- 2026-10-14T11:43:59Z · needs_input
- 2026-10-14T11:46:35Z · status review→active
