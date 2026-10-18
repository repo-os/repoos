---
id: "0826"
title: "CLI: repoos sync <id> (merge main into a task branch, like the drawer's Sync with main)"
type: feature
status: active
priority: p3
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/cli-repoos-sync-id-merge-main-into-a-tas
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-18T04:31:12Z"
updated_at: "2026-10-18T06:17:07Z"
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
