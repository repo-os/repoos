---
id: "0821"
title: "Message queue: deliver queued messages when a turn ends, persist them, and allow queued sends in every AI chat"
type: bug
status: review
priority: p1
area: [server, web]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/message-queue-deliver-queued-messages-wh
created_at: "2026-10-18T02:12:03Z"
updated_at: "2026-10-18T03:47:39Z"
---
## Problem
1. A message sent while an engineer or reviewer is running is queued in memory (src/server/agents.ts, queuedMessages). The queue is only drained when the task is started or sent to again. Nothing drains it when the turn ends, so a message sent during a turn can sit unread while the task moves to review (#0819 was handed off this way). The queue is also lost on a server restart. The 'agent busy — delivers when the turn ends' note is therefore not true.
2. The human cannot queue a message to an AI chat while it is busy. The PM, debugger, CTO and repo guide chats disable Send while busy (PmChatSurface, DebuggerChat, CTOPanel, RepoGuideChat), and the server refuses a chat send with 'agent is busy — wait for the current turn to finish' (src/server/agents.ts ~5710). Only the task-message path queues.

## Desired UX
- A message sent while an AI agent (engineer, reviewer, PM, debugger, CTO, repo guide) is busy is queued, and the Send control stays enabled, showing 'Queued — will be read when the current turn ends'.
- When a turn ends, the queue is delivered in order, and the activity log records it.
- The queue survives a server restart.
- A queued message still not delivered after the turn ends is flagged on the task or chat, so it is never silently lost.

## Acceptance criteria
- Test: a message sent during a running turn is delivered when that turn ends, without another send or start.
- Test: the queue survives a server restart (persisted, not memory only).
- Test: a message queued while the task is in review is delivered to the engineer when it next runs, and the activity log shows it.
- Test: PM, debugger, CTO and repo guide chats accept a queued send while busy and show the queued state.
- Test: a queued message left undelivered after the turn ends is flagged, not dropped.
- Light and dark themes checked on the queued state.

## Notes for AI
Start from the queue in src/server/agents.ts (queuedMessages, messageQueuedAt, checkExpiredMessages, the drain in start and send) and the busy refusal near line 5710. Find the turn-end hook in the agent runner and drain there. Then update the chat send controls in PmChatSurface.vue, DebuggerChat.vue, CTOPanel.vue and RepoGuideChat.vue. Source: user report 2026-10-18 on #0819 messages.

## Activity

- 2026-10-18T02:12:03Z · created · njachowski@gmail.com
- 2026-10-18T02:33:36Z · status inbox→ready
- 2026-10-18T02:33:41Z · status ready→active, branch
- 2026-10-18T03:47:39Z · watchdog: auto-surfaced stuck task · status active→review · agent never started — no session exists for this task · next step: resume the session manually from the task's worktree and check for uncommitted work
- 2026-10-18T03:47:39Z · note: handoff requested (cli)
