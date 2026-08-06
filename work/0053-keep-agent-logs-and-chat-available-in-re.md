---
id: "0053"
title: Keep agent logs and chat available in review state
type: bug
status: review
priority: p1
area: web
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-06T17:54:24Z"
updated_at: "2026-08-06T18:05:05Z"
---
## Problem

When a task is `active`, the web UI shows the agent's logs and lets me chat with the agent in that task's worktree. But once the task moves into `review`, the logs appear to be gone and I can no longer chat with the agent in that worktree.

This breaks the review workflow. Fixing issues spotted during review is supposed to happen by talking to the implementing agent on the same branch/worktree, having it fix them, and re-running `repoos check` to get a green run before sign-off. Without logs and chat in `review`, there is no way to see what the agent did or ask it to fix issues, so the review → fixes loop cannot happen.

## Desired UX

- When a task moves from `active` to `review`, its agent logs stay visible and the chat session with the agent stays available in that task's worktree.
- I can keep chatting with the agent during review to point out issues, request fixes, and have it re-run `repoos check` until the review passes.
- The transition to `review` only changes the task's status — it must not hide, reset, or tear down the agent session, logs, or chat.

## Acceptance criteria

- [ ] A task in `review` shows its agent logs, the same way it did while `active`.
- [ ] Chat with the agent remains available for a task in `review`, scoped to that task's worktree.
- [ ] Moving a task from `active` to `review` does not destroy the chat session or its logs.
- [ ] Messages sent while the task is in `review` reach the agent, and its replies appear in the UI.
- [ ] `repoos check` passes after the change.

## Notes for AI

- Likely root cause: the web UI only surfaces the agent session/logs/chat for tasks whose status is `active`, or the session/worktree is torn down when the status changes. Confirm how the session is keyed to task status and to the worktree before fixing.
- Keep the same branch and worktree open during `review` — this matches the repo's review flow, where fixes are made on the same branch. Do not merge or close the branch.
- Do not change the task status model or the review workflow itself; this task only makes logs and chat survive the `active` → `review` transition.
- Assumption: `review` is the only state besides `active` where logs/chat must remain available; behavior for other states is out of scope unless it falls out of the same fix.
- After the UI change, rebuild (`bun run build:ui` or `bun run build`) and verify against a running `repoos serve` before reporting done.

## Scope

- Covers: keeping agent logs and chat visible and usable across the `active` → `review` transition, including sending new messages while the task is in `review`.
- Deferred: any behavior change for tasks in states other than `review` (e.g. `done`), and any change to the review/sign-off workflow itself.

## Activity

- 2026-08-06T17:54:24Z · created · unknown
- 2026-08-06T17:55:20Z · status inbox→ready
- 2026-08-06T18:05:05Z · status active→review
