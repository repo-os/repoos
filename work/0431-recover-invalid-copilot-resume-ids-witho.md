---
id: "0431"
title: Recover invalid Copilot resume IDs without discarding the worktree
type: bug
status: active
priority: p1
area: agent
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-19T00:42:42Z"
updated_at: "2026-09-19T00:43:15Z"
---
## Problem

A failed GitHub Copilot resume can persist a non-session token (observed: 1220ms) as the task session id. Restart then launches copilot --resume=1220ms, exits immediately, and the restart dialog closes without a useful recovery path. The existing worktree must never be discarded merely because the saved conversation id is invalid.

## Requirements

- Treat a Copilot resume id as valid only when it is a UUID captured from an explicit structured Copilot session event; do not use the generic text session-id extractor for Copilot output.
- When a task has an invalid or absent Copilot resume id, start a fresh Copilot conversation in the same existing worktree. Preserve task context and any repair instruction; do not use Start clean.
- In the restart UI, explain the invalid-session failure and offer an explicit Start fresh in this worktree action. It must preserve the worktree and branch.
- Keep the dialog open on synchronous start failures and render a useful error.
- Refresh/synchronize worktree state before presenting a destructive-changes warning.
- Add regression tests for malformed ids, including 1220ms, fresh-in-worktree launch behavior, and the restart-dialog error/recovery state.

## Acceptance

A task with malformed persisted Copilot resume state can be restarted without knowing a UUID, retains all worktree changes, and starts a new Copilot turn successfully.

## Activity

- 2026-09-19T00:42:42Z · created · unknown
- 2026-09-19T00:43:15Z · body
