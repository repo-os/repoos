---
id: "0853"
title: "Previews: tear down a task's preview server when it leaves active/review, and enforce one preview at a time"
type: bug
status: done
priority: p2
area: server
merged_commit: c7b44b1b1f12a82a263e24212face01c0522de12
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/previews-tear-down-a-task-s-preview-serv
review_cli_override: pi
review_model_override: openrouter/z-ai/glm-5.3-flash
created_at: "2026-10-19T14:24:17Z"
updated_at: "2026-10-19T16:53:02Z"
last_close_out_gate_ms: 131972
last_close_out_gate_at: "2026-10-19T16:52:16.249Z"
review_passes: 1
dev_error_count: 2
---
## Problem
docs/previews.md and AGENTS.md say a task preview is reaped when the task leaves active/review, and that only ONE preview runs at a time (a new request evicts the old). Observed 2026-10-19 on the control-plane machine: the preview server for #0664 (`repoos serve --port 59122` from its worktree, started by `bun run build && bun dist/cli/index.js serve ...`) was still running **21 hours** after #0664 landed and was marked done, while a second preview (#0851, port 54534) was already running, so the one-at-a-time cap was not enforced either. Every preview also runs a full `bun run build` (vue-tsc + vite) in the task worktree before serving, which is a heavy memory/CPU spike on an already loaded laptop.

## Desired UX
- When a task moves to done, is archived, or is paused/restarted such that it is no longer active or in review, its preview server and the build/serve shell around it are stopped within a short grace period; after a server restart or reload, orphaned previews recorded for finished tasks are reaped (adopt-or-stop, like the engineer-orphan handling in #0837).
- At most one preview runs at a time; requesting a new one evicts the previous (cleanly, process group, not by name), and the eviction is logged on the task activity.
- Evidence of reaping is visible: Debug/activity line "preview for #id stopped (task done)" and no leftover `serve --port` processes for finished tasks.
- Optional: reuse a fresh `dist/` when the worktree's source hash is unchanged so repeated shots and previews do not rebuild.

## Acceptance criteria
- Tests: a preview whose task becomes done/archived is stopped; an orphan preview recorded for a done task is reaped on startup; starting a second preview stops the first; a preview for a task still in active/review is untouched.
- Tests: no process is killed by name; only recorded PIDs/process groups of RepoOS-started previews.
- Manual check recorded: after a task lands, no `serve --port` process from its worktree remains.
- docs/previews.md updated to describe the teardown rules and the cap.

## Notes for AI
Look at src/server/preview-manager (or the PreviewManager) and the task status transitions that should trigger teardown; the restart/orphan handling from #0837 (src/server/orphan-engineers.ts) is the model. Do not touch repoos.toml. Source: Nick and the driver session, 2026-10-19.

## Activity

- 2026-10-19T14:24:17Z · created · njachowski@gmail.com
- 2026-10-19T15:05:13Z · review_cli_override, review_model_override
- 2026-10-19T15:05:20Z · review_model_override
- 2026-10-19T15:05:21Z · status inbox→ready
- 2026-10-19T15:05:25Z · status ready→active, branch
- 2026-10-19T15:11:10Z · message_queued at 2026-10-19T15:11:10.211Z
- 2026-10-19T15:11:10Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-19T15:20:07Z · body
- 2026-10-19T15:27:24Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-10-19T15:27:24Z · message_delivered: 1 message(s)
- 2026-10-19T15:27:26Z · note: stopped orphaned engineer pid 97756
- 2026-10-19T15:40:53Z · body
- 2026-10-19T15:48:12Z · body
- 2026-10-19T15:51:28Z · body
- 2026-10-19T16:19:51Z · needs_input
- 2026-10-19T16:22:12Z · body
- 2026-10-19T16:24:26Z · body
- 2026-10-19T16:31:53Z · handoff failed · remote validation failed: test failure: tests/task-archive.test.ts > POST /api/tasks/:id/archive (#0657) > refuses while a preview is running on bee — fix it in the feature branch and re-run the gate
- 2026-10-19T16:40:58Z · body
- 2026-10-19T16:48:55Z · status active→review
- 2026-10-19T16:48:55Z · note: shots: skipped — Docs site skipped: no docs shot declared
- 2026-10-19T16:49:53Z · note: review pass 1: good to go
- 2026-10-19T16:52:16Z · close-out gate completed in 132s
- 2026-10-19T16:53:02Z · status review→done, release:success
