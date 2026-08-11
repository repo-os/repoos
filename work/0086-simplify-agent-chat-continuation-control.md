---
id: "0086"
title: Simplify agent chat continuation controls
type: feature
status: ready
priority: p2
area: ui
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-11T11:55:10Z"
updated_at: "2026-08-11T11:59:03Z"
---
## Problem

Agent chats in tasks show both “Continue” and “Step” lines, but their meanings are unclear. The “Step” line does not appear useful, while the “Continue” line lacks a timestamp that would provide useful context.

## Desired UX

Keep the “Continue” line in task agent chats and display a timestamp with it. Remove the “Step” line so the chat presents only the useful continuation information.

## Acceptance criteria

- [ ] The “Continue” line remains visible in task agent chats.
- [ ] Each “Continue” line displays a timestamp.
- [ ] The “Step” line is no longer displayed in task agent chats.

## Notes for AI

- Limit this change to the presentation of agent chats within tasks.
- Assume the timestamp should use the existing timestamp format used elsewhere in the task chat UI.
- Do not change the underlying meaning or behavior of “Continue”; only add its timestamp.
- Remove the “Step” line from the displayed chat rather than replacing it with another element.

## Activity

- 2026-08-11T11:55:10Z · created · unknown
- 2026-08-11T11:59:03Z · status inbox→ready
