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
updated_at: "2026-10-16T08:55:26Z"
---
## Problem
The PM chat shows 'Copilot emitted an unknown protocol event "user.message".' The Copilot event parser (src/server/agents.ts, around line 2030) ignores a fixed list of internal events. A newer Copilot build sends user.message, which echoes the user's own message, and it isn't on the list, so it shows as a system line. The chat keeps working.

## Desired UX
- user.message does not appear as an unknown-event line. The chat shows only what it already shows for the user's own messages.
- Any other unknown event still shows the line, so a real new event type is still visible.

## Acceptance criteria
- Test: a user.message event produces no transcript entry.
- Test: an unrecognised event type still produces the unknown-event line.

## Notes for AI
Add user.message to the ignored event types next to the existing ignored Copilot events in src/server/agents.ts. One item for now; other small Copilot parser items can join this bundle. Source: user report 2026-10-16 on the PM chat.

## Activity

- 2026-10-16T08:55:26Z · created · njachowski@gmail.com
