---
id: "0110"
title: Move agent review into a dedicated tab with follow-up controls
type: feature
status: ready
priority: p2
area: ui
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-12T02:34:47Z"
updated_at: "2026-08-12T11:10:11Z"
---
## Problem

For tasks in the review state, the Agent Review experience is not separated into its own tab. Humans also cannot start a fresh review, chat directly with the reviewer in a session separate from the engineer session, or clearly see when the AI reviewer is actively working.

## Desired UX

When viewing a task in the review state, the task interface has a third tab dedicated to Agent Review. This tab shows the reviewer conversation and provides a text input for the human to chat with the reviewer without sending messages to the engineer session.

A "Review again" button starts a fresh reviewer run. While the reviewer is working, the tab displays the product's active AI state animations.

## Acceptance criteria

- [ ] Tasks in the review state show Agent Review as a third tab.
- [ ] The Agent Review tab contains a text input that lets the human chat with the reviewer.
- [ ] Reviewer messages use a session separate from the engineer session.
- [ ] The Agent Review tab includes a "Review again" button.
- [ ] Selecting "Review again" starts a fresh review run.
- [ ] The UI shows active AI state animations while the reviewer is working.
- [ ] The reviewer conversation and activity state are displayed within the Agent Review tab.

## Notes for AI

- Assume the third tab is shown only when the task is in the review state.
- Treat each use of "Review again" as a fresh reviewer run rather than a continuation of the prior run.
- Keep reviewer chat isolated from the engineer session in both UI state and message routing.
- Reuse the existing active AI state animation patterns rather than introducing a separate visual language.
- Do not change the engineer session behavior.

## Activity

- 2026-08-12T02:34:47Z · created · unknown
- 2026-08-12T11:10:11Z · status inbox→ready
