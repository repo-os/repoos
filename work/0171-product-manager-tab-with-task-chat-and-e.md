---
id: "0171"
title: Product Manager tab with task chat and editing
type: feature
status: ready
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-13T13:54:10Z"
updated_at: "2026-08-13T13:55:37Z"
---
## Problem

Tasks today are static artifacts: once created, there is no built-in way for a user to discuss a task with an AI agent or request live edits to it. The PM AI agent should be able to edit tasks and chat about them throughout the whole task lifecycle (inbox → ready → active → review → done), but the UI currently offers no surface for that interaction.

## Desired UX

- A new "Product Manager" tab is available in the web UI, alongside the existing task views.
- The tab shows a chat panel where the user can talk to the PM AI agent at any time, about any task and at any stage of its lifecycle.
- The user can request task edits through the chat (e.g. "update title to X", "add acceptance criterion Y", "bump priority to p1"), and the PM applies those edits to the task.
- The PM can also proactively edit tasks as part of the conversation.
- The tab exposes controls to switch the agent used for the PM and to change its model, mirroring the agent/model selection used elsewhere in RepoOS.
- Edits made by the PM show up in the task immediately and follow the same persistence rules as other task manipulation.

## Acceptance criteria

- [ ] A "Product Manager" tab is present in the web UI and reachable from the main navigation.
- [ ] The tab contains a chat interface for conversing with the PM AI agent.
- [ ] The user can open a chat about any task at any lifecycle stage.
- [ ] The user can request task edits (title, description, acceptance criteria, priority, etc.) via the chat and the PM applies them.
- [ ] PM-applied edits persist to the task through the existing task API and are reflected in the task drawer/list.
- [ ] The tab allows changing the PM agent and its model; the change is reflected in subsequent chat responses.
- [ ] New edits go through the same normalized frontmatter/persistence path as other task writes.

## Notes for AI

- Reuse the existing agent/model configuration patterns already in RepoOS rather than inventing a new one.
- The PM must make task edits through the existing HTTP API endpoints (`PATCH /api/tasks/:id`, etc.) — never write to `work/*.md` files directly.
- The chat state should persist across navigation and reloads if the existing chat/SSE infrastructure allows; otherwise a reasonable in-memory session is an acceptable default (state this assumption in the PR).
- Do not add runtime dependencies without an explicit task authorizing them.
- If the PM edit flow needs new API surface, keep it consistent with the server's SSE/HTTP architecture.
- Assumption: the PM agent is the same agent type used elsewhere for conversational agents, and "changing the model" follows the same model picker pattern used in existing agent configuration.

## Scope

- Covers: the PM tab UI, chat with the PM agent, PM-driven task edits, agent and model selection.
- Deferred: multi-agent conversations, PM-generated task creation from scratch, and any fine-grained permission/audit model for PM edits.

## Related

- Existing task chat/SSE infrastructure and agent/model configuration in `src/server` and `src/ui-app`.
- `AGENTS.md` rules on task manipulation via API only.

## Activity

- 2026-08-13T13:54:10Z · created · unknown
- 2026-08-13T13:55:37Z · status inbox→ready
