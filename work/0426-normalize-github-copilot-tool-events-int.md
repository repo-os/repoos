---
id: "0426"
title: Normalize GitHub Copilot tool events into readable transcript cards
type: bug
status: ready
priority: p2
area: agent
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-18T17:46:35Z"
updated_at: "2026-09-18T19:10:11Z"
---
GitHub Copilot CLI 1.0.86 emits JSONL tool.execution_partial_result records with toolCallId and partialOutput. The Copilot adapter recognizes start and completion only, so partial records fall back to raw JSON lines in the task chat. Normalize the start, partial, and complete lifecycle by toolCallId into one readable, collapsible tool card; preserve exact tool output without turning it into AI-generated prose. Recognized non-surfaceable JSON must not render as a legacy raw line. Add fixtures covering repeated partial output, completion/error handling, and an unknown-event diagnostic fallback. Keep the behavior consistent with the structured adapters for Claude and OpenCode.

## Activity

- 2026-09-18T17:46:35Z · created · unknown
- 2026-09-18T17:46:59Z · body
- 2026-09-18T19:10:11Z · status inbox→ready
