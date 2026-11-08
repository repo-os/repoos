---
id: "0963"
title: Build the simplified client project board
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/build-the-simplified-client-project-boar
cli_override: codex
model_override: gpt-6.1-terra
pm_cli_override: cursor
pm_model_override: grok-4.7-medium
review_cli_override: codex
review_model_override: gpt-6-luna
created_at: "2026-10-26T19:44:54Z"
updated_at: "2026-11-08T06:49:00Z"
---
## Problem

The landing page at `/for-clients` explains RepoOS managed services and shows an illustrative project board: a shared, plain-language view of what is being built. That board is labelled as an illustration. The product does not have this client-level view yet, so the visibility the page describes is not something a client can open.

## Desired UX

A client opens their project and sees a simplified board, in the shape already shown on For Clients.

The view names the project and gives a one-line description of the work. Under that, the work sits in three columns — Planned, Building, and Reviewed. Each card shows the task id, a plain title, and a short status line (the landing illustration uses lines such as “Scoped & ready”, “Next up”, “Engineer working”, and “Checks passed”).

It is a view of the work, not the operator board. The client is not running agents, checks, or close-out from this screen. Copy stays in everyday language: the client is not expected to be technical, and the page’s promise is that they can follow progress without managing the tooling.

The sample project on the landing page (“Customer operations portal”, “SPRINT 02”, and the fake card titles) stays illustrative. This view shows the real project’s tasks.

## Acceptance criteria

- [ ] The app has a client-level board that is a simplified view of the project’s tasks.
- [ ] The board shows the project name, a one-line description of the work, and three columns: Planned, Building, and Reviewed.
- [ ] Each card shows a task id, a title, and a short plain-language status derived from the task’s existing state.
- [ ] Cards are the real project’s tasks. The landing page’s sample project and sample cards are not hardcoded into this view.
- [ ] The view does not include the operator controls for running agents, checks, settings, or close-out.
- [ ] The For Clients marketing page is left as the existing illustration. This task builds the product view it depicts.

## Notes for AI

The visual target is the illustrative board in `landing/src/components/ForClients.vue` (the block labelled “Illustrative client project board”). Match that shape. Do not restyle the marketing page, and do not treat its sample copy, sprint tag, or “Human direction” blurb as product data to implement.

Assumptions, where the request does not specify:

- This is a read-only presentation of the existing task board, not a second task system and not a new client-account or invite flow. There is no client role in the product today; do not add one in this task. Ship the view so it can be opened for a project.
- Map current task statuses into the three columns: inbox and ready → Planned, active → Building, review → Reviewed. Leave done off this board. Derive the short status line from that state; do not add a new status field.
- The landing sample’s “SPRINT 02” tag is illustration only. Do not add a sprint model.
- “Client-level” means the reduced board above. It does not include client comments, approvals, demos, or milestone editing, even though the marketing page mentions demos and milestones as part of the service.

Prefer existing board task data. Touch server code only if that data cannot be presented in this shape from the client.

## Scope

In: the simplified three-column project board, fed by real tasks, without operator controls.

Out: changes to the For Clients page, client login or invites, sprints, and any workflow for the client to edit, comment on, or approve work.

## Related

- #0849 — For Clients landing page, including the illustrative board this task builds for real.

## Shots
```json
[
{
"label": "Read-only client project board",
"target": "default",
"route": "/client-board",
"highlight": ".client-board",
"state": "board:pipeline"
}
]
```

## Original prompt

We have a new page on the landing page called "For Clients" which explains the RepoOS managed services and shows a screenshot of what it looks like, but we haven't built it yet. It's essentially a simplified board that's client-level. Let's build it.

## Screenshots

![Screenshot-2026-10-27-at-02.42.54](/api/tasks/0963/attachments/att_da9e4484-5926-4fb5-85d9-91c439ff820f.png)

## Activity

- 2026-10-26T19:44:54Z · created · hello@repoos.org
- 2026-10-26T19:45:25Z · screenshots
- 2026-10-26T19:47:08Z · needs_input
- 2026-10-26T19:47:47Z · status draft→inbox, title, area, body: Problem (added); Desired UX (added); Acceptance criteria (added); Notes for AI (added); Scope (added); Related (added)
- 2026-10-26T19:47:47Z · needs_input
- 2026-11-06T05:05:53Z · status inbox→ready
- 2026-11-08T06:05:03Z · cli_override, model_override, review_cli_override, review_model_override
- 2026-11-08T06:05:04Z · status ready→active, branch
- 2026-11-08T06:07:03Z · body
- 2026-11-08T06:18:15Z · note: adopted orphaned engineer pid 36650
- 2026-11-08T06:18:45Z · body
- 2026-11-08T06:20:32Z · CTO nudge: held — handoff gate is running
- 2026-11-08T06:32:57Z · handoff failed · remote validation failed: test failure: tests/app-loading-skeleton.test.ts > repo loading skeleton > maps every standard route to an explicit skeleton kind, tests/shot-target-support-0866.test.ts > app target resolution (#0866) > keeps APP_ROUTE_PREFIXES in sync with the UI router on thinkpad — fix it in the feature branch and re-run the gate
- 2026-11-08T06:32:57Z · message_queued at 2026-11-08T06:32:57.989Z
- 2026-11-08T06:33:14Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-08T06:38:15Z · CTO action: restart-stalled-agent (resume) · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/app-loading-skeleton.test.ts > repo loading skeleton > maps every standard route to an explicit skeleton kind, tests/shot-target-support-0866.test.ts > app target resolution (#0866) > keeps APP_ROUTE_PREFIXES in sync with the UI router on thinkpad — fix it in the feature branch and re-run the gate
- 2026-11-08T06:43:15Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/app-loading-skeleton.test.ts > repo loading skeleton > maps every standard route to an explicit skeleton kind, tests/shot-target-support-0866.test.ts > app target resolution (#0866) > keeps APP_ROUTE_PREFIXES in sync with the UI router on thinkpad — fix it in the feature branch and re-run the gate · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-11-08T06:43:15Z · note: handoff requested (cli)
- 2026-11-08T06:48:14Z · CTO nudge: held — handoff gate is running
- 2026-11-08T06:49:00Z · message_delivered: 1 message(s)
