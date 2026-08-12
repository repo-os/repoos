---
id: "0149"
title: Send ntfy notifications for task state transitions
type: feature
status: done
priority: p2
area: core
assigned_to: ai
created_by: ""
branch: feat/send-ntfy-notifications-for-task-state-t
created_at: "2026-08-12T18:19:01Z"
updated_at: "2026-08-12T18:34:52Z"
---
## Problem

We have ntfy notifications set up but aren't using them to keep users informed when their tasks progress through the workflow. Task state changes are invisible to assignees and stakeholders until they explicitly check the system.

## Desired UX

When a task transitions between workflow states, an ntfy notification is automatically sent to notify relevant parties of the change:
- Task moves from ready → active (work has started)
- Task moves from active → review (work is ready for review)
- Task moves from review → done (task is complete)
- Task gets stuck or needs human input (e.g., reviewer finished and human action required, task stalled in active)

## Acceptance Criteria

- [ ] Notification sent when task transitions from ready to active
- [ ] Notification sent when task transitions from active to review
- [ ] Notification sent when task transitions from review to done
- [ ] Notification sent when task needs human input or is stuck
- [ ] Notifications are delivered via ntfy
- [ ] Each notification includes relevant context (task ID, title, current status)

## Notes for AI

- Integrate with existing ntfy setup already in place
- Identify where task status changes are triggered in the codebase (likely a state machine or update handler)
- For "needs human input" notifications: determine detection logic (e.g., timeout in active state, manual flag, reviewer feedback requiring action)
- Keep notifications concise and actionable
- Assumption: ntfy client/library is already available and configured

## Scope

**Covers:** Automatic notifications for the four main state transitions and human-input scenarios.

**Deferred:** Notification preferences/settings per user, notification templates customization, notification history/logs.

## Activity

- 2026-08-12T18:19:01Z · created · unknown
- 2026-08-12T18:19:25Z · status inbox→ready
- 2026-08-12T18:26:39Z · status ready→review, branch
- 2026-08-12T18:34:52Z · status review→done, release:success
