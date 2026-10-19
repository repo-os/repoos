---
id: "0853"
title: "Previews: tear down a task's preview server when it leaves active/review, and enforce one preview at a time"
type: bug
status: ready
priority: p2
area: server
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
review_cli_override: pi
review_model_override: openrouter/z-ai/glm-5.3-flash
created_at: "2026-10-19T14:24:17Z"
updated_at: "2026-10-19T15:05:21Z"
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
