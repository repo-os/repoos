---
id: "0114"
title: Add persistent repo-aware agent chat
type: feature
status: review
needs_merge: true
priority: p2
area: ui
assigned_to: ai
created_by: ""
branch: feat/add-persistent-repo-aware-agent-chat
created_at: "2026-08-12T04:07:06Z"
updated_at: "2026-08-12T06:13:34Z"
---
## Problem

RepoOS does not provide an always-available place for users to ask questions about the current repository, its tasks, statuses, or issues. Users must leave their current context to find relevant information or interact with agents, making repository-wide assistance less accessible.

## Desired UX

A customer-service-style chat launcher appears persistently in the bottom-right corner of the app. Users can open it from anywhere, chat with a default repo-aware AI agent, minimize it, and continue navigating the app without losing the conversation.

The agent understands the current RepoOS repository and can discuss RepoOS, tasks, statuses, issues, and other repository-related context. The same default agent is visible on the Agents page so users can discover and manage it alongside other agents.

## Acceptance criteria

- [ ] A persistent agent-chat launcher is displayed in the bottom-right corner throughout the app.
- [ ] Selecting the launcher opens a chat panel without navigating away from the current page.
- [ ] The chat panel can be minimized or closed back to the launcher.
- [ ] The open or minimized chat remains available while navigating between app pages.
- [ ] The conversation is preserved during in-app navigation.
- [ ] Messages entered in the chat are sent to a default repo-aware agent.
- [ ] The agent can use available repository context to answer questions about RepoOS, repository tasks, task statuses, and issues.
- [ ] The default chat agent also appears on the Agents page.
- [ ] The chat UI clearly identifies which agent the user is speaking with.
- [ ] The chat launcher and panel do not obscure essential app controls at supported viewport sizes.
- [ ] Existing agent and task workflows continue to work unchanged.
- [ ] `repoos check` passes.

## Notes for AI

- Treat “persistent” as persistence across client-side navigation; durable conversation storage across browser restarts is not required unless existing chat infrastructure already provides it.
- Use a default agent named **RepoOS Guide**, configured as a general-purpose, repository-aware assistant. This is the assumed best fit for broad questions rather than a narrowly scoped implementation or review agent.
- Reuse existing agent, chat, repository-context, and conversation infrastructure where available.
- Add RepoOS Guide through the same agent model and presentation used by the Agents page; do not create a separate incompatible agent representation solely for the floating chat.
- Keep the interaction visually similar to a familiar customer-service chat launcher and panel while following the app’s existing visual conventions.
- Do not change existing task semantics, statuses, or agent responsibilities.
- Rebuild the UI and verify the change using the task’s managed preview rather than starting `repoos serve` directly.

## Scope

This task covers the persistent floating chat experience, its repo-aware default agent, and exposing that agent on the Agents page. Broader changes to other agents or unrelated chat capabilities are deferred.

## Activity

- 2026-08-12T04:07:06Z · created · unknown
- 2026-08-12T04:08:57Z · status inbox→ready
- 2026-08-12T04:08:58Z · status ready→active · ai
- 2026-08-12T04:28:30Z · needs_input · managed preview control plane unavailable at 127.0.0.1:7171
- 2026-08-12T04:20:03Z · status ready→active, branch
- 2026-08-12T05:34:06Z · status active→review
- 2026-08-12T05:34:06Z · needs_merge
- 2026-08-12T06:07:45Z · status review→active
- 2026-08-12T06:07:52Z · status active→review
- 2026-08-12T06:13:28Z · status review→active
- 2026-08-12T06:13:34Z · status active→review
