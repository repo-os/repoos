---
id: "0805"
title: "Easter eggs bundle: Copilot user.message shown as an unknown protocol event"
type: bug
status: inbox
priority: p3
area: server
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-16T08:55:26Z"
updated_at: "2026-10-16T09:42:43Z"
---
## Problem
The PM chat shows 'Copilot emitted an unknown protocol event' for two internal events that are not on the Copilot parser's ignore list (src/server/agents.ts, around line 2030):
- user.message: echoes the user's own message, so the chat already shows it.
- assistant.idle: a turn-idle signal with no transcript content.

Both are harmless. The chat keeps working.

## Desired UX
- user.message and assistant.idle do not appear as unknown-event lines.
- Any other unknown event still shows the line, so a real new event type stays visible.

## Acceptance criteria
- Test: a user.message event produces no transcript entry.
- Test: an assistant.idle event produces no transcript entry.
- Test: an unrecognised event type still produces the unknown-event line.

## Notes for AI
Add user.message and assistant.idle to the ignored event types next to the existing ignored Copilot events in src/server/agents.ts. Other small Copilot parser items can join this bundle. Source: user reports 2026-10-16 on the PM chat.

## Activity

- 2026-10-16T08:55:26Z · created · njachowski@gmail.com
- 2026-10-16T09:42:43Z · body
