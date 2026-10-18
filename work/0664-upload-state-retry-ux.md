---
id: "0664"
title: Upload state + retry UX
type: feature
status: review
priority: p1
area: ui
story: Cloud attachment storage
depends_on: ["0660"]
assigned_to: ai
created_by: ""
branch: feat/upload-state-retry-ux
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-05T08:29:24Z"
updated_at: "2026-10-18T18:57:48Z"
review_passes: 4
last_check_failure: "repoos check at 2026-10-18T17:32:06.903Z: repoos check failed: ui-smoke — $ bun scripts/ui-smoke.mjs"
review_rounds: 1
handoff_signal_retry_count: 1
---
Slice 7: Uploading / retrying / failed states visible in UI. Attachment never shown as available before upload succeeds. Retry without re-deriving user input.

## Acceptance criteria
- [ ] Uploading state: attachment card shows spinner/progress; file not listed as "available".
- [ ] Failed state: card shows retry action; error visible; file remains selected.
- [ ] Retry: re-submits same file/user input without re-deriving input.
- [ ] Success: only after server-confirmed upload is attachment listed as available.
- [ ] Covers upload targets (screenshots / inputs / attachments).

## Scope
Slice 7 of cloud attachment storage (depends_on: 0660). Purely UI/UX state rendering + retry flow.

## Questions for human
1. Retry endpoint: same upload endpoint or dedicated retry endpoint?
2. Auto-retry once before showing failed state?
3. Max retry count enforced in UI?

## Shots
```json
[
{
"label": "New input: outstanding failed attachment upload with retry",
"target": "default",
"route": "/inputs",
"highlight": ".ff-upload-followup .ff-pending-file-retry",
"state": "panel:newInputOutstandingUpload"
},
{
"label": "New task: failed screenshot retry row on freeform form",
"target": "default",
"route": "/work",
"highlight": ".ff-upload-followup .ff-pending-file-retry",
"state": "panel:freeformFailedScreenshot"
}
]
```

## Activity

- 2026-10-05T08:29:24Z · created · unknown
- 2026-10-05T09:16:46Z · needs_input, questions, body
- 2026-10-18T16:16:44Z · status inbox→ready
- 2026-10-18T16:16:47Z · cli_override, model_override
- 2026-10-18T16:16:49Z · status ready→active, needs_input, branch
- 2026-10-18T16:49:58Z · body
- 2026-10-18T16:58:34Z · status active→review
- 2026-10-18T16:58:35Z · note: Task body is underspecified: missing sections: Problem, Desired UX, Notes for AI
- 2026-10-18T16:59:34Z · note: review pass 1: needs some work
- 2026-10-18T17:01:02Z · note: review pass 2: needs some work
- 2026-10-18T17:02:38Z · note: review pass 3: needs some work
- 2026-10-18T17:02:39Z · status review→active
- 2026-10-18T17:07:45Z · message_queued at 2026-10-18T17:07:45.691Z
- 2026-10-18T17:07:45Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-18T17:08:06Z · body
- 2026-10-18T17:11:04Z · body
- 2026-10-18T17:13:18Z · body
- 2026-10-18T17:22:18Z · handoff failed · handoff recovery attempted · finalization failed
- 2026-10-18T17:22:21Z · message_delivered: 1 message(s)
- 2026-10-18T17:23:29Z · body
- 2026-10-18T17:40:24Z · body
- 2026-10-18T17:49:30Z · note: ui verification failed (3 issue(s)): [missing-target] New input: outstanding attachment uploads after Create another input: waitFor .new-input-trigger: waitFor: Timeout 5000ms exceeded. on /work (http://127.0.0.1:49344/work); [missing-target] New input: outstanding attachment uploads after Create another input: click .new-input-trigger: click: Timeout 5000ms exceeded. on /work (http://127.0.0.1:49344/work); [missing-target] New task: failed screenshot retry row on freeform form: click .new-btn:
- 2026-10-18T17:49:32Z · handoff failed · check failed after 2 automatic retries · ui verification failed (3 issue(s)): [missing-target] New input: outstanding attachment uploads after Create another input: waitFor .new-input-trigger: waitFor: Timeout 5000ms exceeded. on /work (http://127.0.0.1:49344/work); [missing-target] New input: outstanding attachment uploads after Create another input: click .new-input-trigger: click: Timeout 5000ms exceeded. on /work (http://127.0.0.1:49344/work); [missing-target] New task: failed screenshot retry row on freeform form: click .new-btn: click: Timeout 5000ms exceeded. on /work (http://127.0.0.1:49344/work)
- 2026-10-18T18:19:31Z · watchdog: auto-surfaced stuck task · status active→review · handoff recovery was attempted after an interrupted turn but finalization failed — manual intervention needed · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-10-18T18:19:31Z · note: handoff requested (cli)
- 2026-10-18T18:50:48Z · CTO action: restart-stalled-agent (resume) · handoff recovery was attempted after an interrupted turn but finalization failed — manual intervention needed
- 2026-10-18T18:51:57Z · body
- 2026-10-18T18:52:29Z · body
- 2026-10-18T18:55:19Z · body
- 2026-10-18T18:56:14Z · body
- 2026-10-18T18:56:37Z · status active→review
- 2026-10-18T18:57:47Z · note: review pass 4: needs some work — clamped by automated verification: browser verification: Handoff browser verification recorded 3 blocking issue(s): [missing-target] New input: outstanding attachment uploads after Create another input: waitFor .new-input-trigger: waitFor: Timeout 5000ms exceeded. on /work; [missing-target] New input: outstanding attachment uploads after Create another input: click .new-input-trigger: click: Timeout 5000ms exceeded. on /work; [missing-target] New task: failed screenshot retry row on freeform form: click .new-btn: click: Timeout 5000ms exceeded. on /work
- 2026-10-18T18:57:48Z · message_queued at 2026-10-18T18:57:48.701Z
