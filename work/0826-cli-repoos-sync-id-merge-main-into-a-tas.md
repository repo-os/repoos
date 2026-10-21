---
id: "0826"
title: "CLI: repoos sync <id> (merge main into a task branch, like the drawer's Sync with main)"
type: feature
status: done
priority: p3
area: core
merged_commit: "09ebb4a8a4c91a3a347b503bb931a4645204af74"
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/cli-repoos-sync-id-merge-main-into-a-tas
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-18T04:31:12Z"
updated_at: "2026-10-21T04:15:06Z"
last_close_out_gate_ms: 397618
last_close_out_gate_at: "2026-10-18T07:19:32.615Z"
review_passes: 2
---
## Problem
The task drawer and the Debug tab have a "Sync with main" action (store `syncTaskBranch`, `POST /api/tasks/:id/sync`) that merges main into a task's branch. There is no CLI equivalent, so a driver agent facing a simple close-out merge conflict has to hand-run git in the worktree or send the task back to the engineer for a repair cycle.

## Desired UX
`repoos sync <id> [--json] [--port N]` calls the same endpoint (one-shot auth like `start`/`done`), prints success, or lists the conflicting paths and exits non-zero. Same guards as the UI action; no conflict auto-resolution beyond what the endpoint already does.

## Acceptance criteria
- Test: success, conflict (paths listed, non-zero exit) and error responses are rendered.
- Refuses with a clear message for a task with no worktree, and for a task in review or close-out unless the endpoint allows it (do not bypass the review lock rules in AGENTS.md).
- CLI help and user-docs/cli.md (Control plane) updated.

## Notes for AI
Mirror the existing control-plane commands in src/commands (start/pause/done). Reuse the endpoint; do not add a second merge path. Source: driver discussion 2026-10-18.

## Activity

- 2026-10-18T04:31:12Z · created · njachowski@gmail.com
- 2026-10-18T05:37:02Z · status inbox→ready
- 2026-10-18T05:51:42Z · cli_override, model_override
- 2026-10-18T05:51:45Z · status ready→active, branch
- 2026-10-18T05:53:46Z · body
- 2026-10-18T06:02:56Z · handoff failed · remote validation failed: test failure: tests/serve-reaper.test.ts > orphaned-root sweep classification (#0216) > reaps a real serve-shaped process whose tmpdir root is deleted (#0216) on thinkpad — fix it in the feature branch and re-run the gate
- 2026-10-18T06:08:39Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/serve-reaper.test.ts > orphaned-root sweep classification (#0216) > reaps a real serve-shaped process whose tmpdir root is deleted (#0216) on thinkpad — fix it in the feature branch and re-run the gate · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-18T06:08:39Z · note: handoff requested (cli)
- 2026-10-18T06:14:45Z · CTO action: restart-stalled-agent (resume) · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/serve-reaper.test.ts > orphaned-root sweep classification (#0216) > reaps a real serve-shaped process whose tmpdir root is deleted (#0216) on thinkpad — fix it in the feature branch and re-run the gate
- 2026-10-18T06:17:07Z · body
- 2026-10-18T06:22:59Z · body
- 2026-10-18T06:25:21Z · body
- 2026-10-18T06:38:52Z · message_queued at 2026-10-18T06:38:52.434Z
- 2026-10-18T06:38:53Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-18T06:52:09Z · status active→review
- 2026-10-18T06:52:10Z · note: shots: skipped — Docs site skipped: no docs shot declared
- 2026-10-18T06:52:50Z · note: review pass 1: good to go
- 2026-10-18T06:52:51Z · note: review pass 2: good to go
- 2026-10-18T07:19:32Z · close-out gate completed in 398s
- 2026-10-18T07:20:00Z · status review→done, release:success
- 2026-10-18T08:09:47Z · message_overdue: still queued after 60m without being delivered
- 2026-10-18T09:09:28Z · message_overdue: still queued after 60m without being delivered
- 2026-10-18T11:53:34Z · message_overdue: still queued after 60m without being delivered
- 2026-10-18T12:23:23Z · message_overdue: still queued after 60m without being delivered
- 2026-10-18T13:07:17Z · message_overdue: still queued after 60m without being delivered
- 2026-10-18T14:16:57Z · message_overdue: still queued after 60m without being delivered
- 2026-10-18T16:43:48Z · message_overdue: still queued after 60m without being delivered
- 2026-10-18T17:21:13Z · message_overdue: still queued after 60m without being delivered
- 2026-10-18T18:26:48Z · message_overdue: still queued after 60m without being delivered
- 2026-10-18T18:57:47Z · message_overdue: still queued after 60m without being delivered
- 2026-10-18T19:02:49Z · message_overdue: still queued after 60m without being delivered
- 2026-10-19T02:46:48Z · message_overdue: still queued after 60m without being delivered
- 2026-10-19T07:51:19Z · message_overdue: still queued after 60m without being delivered
- 2026-10-19T13:55:06Z · message_overdue: still queued after 60m without being delivered
- 2026-10-19T14:51:11Z · message_overdue: still queued after 60m without being delivered
- 2026-10-19T15:43:30Z · message_overdue: still queued after 60m without being delivered
- 2026-10-19T16:19:53Z · message_overdue: still queued after 60m without being delivered
- 2026-10-19T19:46:45Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T04:26:29Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T11:08:19Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T15:31:55Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T16:09:57Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T17:21:44Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T18:33:39Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T19:47:05Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T20:10:42Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T21:10:03Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T21:57:00Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T22:12:32Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T23:15:29Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T23:17:42Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T00:05:51Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T01:05:50Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T02:04:01Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T04:15:06Z · message_overdue: still queued after 60m without being delivered
