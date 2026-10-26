---
id: "0963"
title: Build the simplified client project board
type: feature
status: inbox
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Problem, Acceptance criteria, Notes for AI; body under 400 characters (excluding original prompt)"
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: ""
pm_cli_override: cursor
pm_model_override: grok-4.7-medium
created_at: "2026-10-26T19:44:54Z"
updated_at: "2026-10-26T19:47:47Z"
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

## Original prompt

We have a new page on the landing page called "For Clients" which explains the RepoOS managed services and shows a screenshot of what it looks like, but we haven't built it yet. It's essentially a simplified board that's client-level. Let's build it.

## Screenshots

![Screenshot-2026-10-27-at-02.42.54](/api/tasks/0963/attachments/att_da9e4484-5926-4fb5-85d9-91c439ff820f.png)

## Activity

- 2026-10-26T19:44:54Z · created · hello@repoos.org
- 2026-10-26T19:45:25Z · screenshots
- 2026-10-26T19:47:08Z · needs_input
- 2026-10-26T19:47:47Z · status draft→inbox, title, area, body: Problem (added); Desired UX (added); Acceptance criteria (added); Notes for AI (added); Scope (added); Related (added)
