---
id: "0295"
title: Add a note/activity mechanism for task updates
type: feature
status: ready
priority: p2
area: core
assigned_to: ai
created_by: hello@repoos.org
branch: ""
cli_override: claude code
model_override: default
created_at: "2026-08-25T11:26:17Z"
updated_at: "2026-08-28T10:44:47Z"
---
## Problem

When a PM agent (or any agent) wants to send instructions back to a developer after a task has gone through dev and review rounds, there is currently no dedicated way to attach a note to a task. In #0290, the PM needed to flag a change to the developer but found "there's no dedicated 'note' command." The only workaround was to append a `## Review notes` section to the task body so the developer would see the requested updates inline, relying on the activity record for the status transition.

This is a generally useful feature: agents frequently need to communicate free-form guidance to a developer without changing the task body or scrambling for an ad-hoc convention. The lack of a first-class note mechanism makes this harder than it should be and leads to inconsistent workarounds.

## Desired UX

Agents should be able to append a short, free-form note to a task that surfaces to the developer (and to the human in the UI). The note should be visible where the task's activity/history is displayed, so both human and AI reviewers see it. The note is an additive channel alongside the existing activity log — it should not require rewriting the task body.

Additionally, when a human wants to "send to engineer" (send review to engineer), they should also be able to add a note via a popup modal with a text area. This note is optional, allowing the human to send to engineer without a note if desired. For example, there's a task now #0313 which passed review with "good to go" green but when I opened up the preview url I see it has a problem so I want to send it back to the engineer with specific instructions about the issue and also tell it to handle the suggestions in the review.

## Acceptance criteria

- [ ] Provide a way to add a note to a task via the CLI (e.g. a dedicated note subcommand or a note option on an existing status/move command).
- [ ] The note is persisted and associated with the task.
- [ ] The note is surfaced in the UI wherever the task's activity/history is displayed, so both human and AI reviewers see it.
- [ ] A note can be added together with a status transition in a single operation (e.g. move to active with a note), rather than requiring two separate steps.
- [ ] Existing behavior of status transitions without a note is unchanged.
- [ ] When a human sends a task to engineer from review, they can optionally add a note via a popup modal with a text area.

## Notes for AI

- This is a core/API + CLI + UI feature: the note needs to flow from the CLI or HTTP API through storage into the UI render.
- Storage and APIs are handled via RepoOS CLI commands or HTTP API endpoints, never by writing task markdown directly.
- The note should be distinct from the task body — appending a section to the body (the #0290 workaround) should remain unnecessary once this lands.
- The note accompanies the activity log; ensure the note entry is recorded as an activity entry so the timeline stays coherent.
- Assumption: the note is a short string (a sentence or two) attached as its own activity/entry type. If a richer format is later wanted, that can be a follow-up.
- No new runtime dependencies may be introduced without a separate task authorizing them.

## Scope

This task covers adding a first-class note mechanism across CLI/API/UI and plumbing it into the activity timeline, including adding a note alongside a status transition. Deferred: rich multi-line/attached notes, note threading or editing of existing notes, and notifications.

## Original prompt

I was chatting with the PM agent on #0290 and the task had gone through a few rounds of dev and review already, but I decided I wanted to add some additional scope the task, and the PM helped me to update the task spec, but then it flagged a missing feature to me: `Now send it back to the developer with a note. Let me check how to move status with a note/activity entry. Let me set it back to active (dev) and check for a note mechanism.

Checked with bash · completed
PM
Now I need to add a note to the task for the developer. Let me check if there's a way to append a note via the CLI.

Checked with bash · completed
PM
There's no dedicated "note" command. The note to the developer is best captured through the activity/body. Since there's no note field exposed in the CLI, I'll append a ## Review notes section to the task body so the developer sees the requested updates inline, and the activity already records the status transition.`

## Activity

- 2026-08-28T10:44:47Z · body
