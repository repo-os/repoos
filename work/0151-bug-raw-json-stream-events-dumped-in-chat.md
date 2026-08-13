---
id: "0151"
title: "bug: raw JSON stream events dumped in chat instead of formatted messages"
type: bug
status: review
needs_input: true
priority: p1
area: ui
assigned_to: ai
created_by: ""
branch: feat/bug-raw-json-stream-events-dumped-in-cha
created_at: "2026-08-13T00:00:00Z"
updated_at: "2026-08-13T10:52:09Z"
---
## Description

When running a task with Claude Code as the agent, the Agent tab chat output is completely unreadable. Instead of formatted, human-readable chat messages, the entire stream of raw JSON events from the Anthropic API is being dumped directly into the chat panel.

## Problem Statement

Users see output like:
```json
{"type":"stream_event","event":{"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"handoff-ready::"}},"session_id":"333b008c-7453-4ac1-8f9c-a3175d4db016","parent_tool_use_id":null,"uuid":"62410105-4196-42e5-a751-93cd0e8d09f7"}
✓ agent requested server-side handoff
{"type":"stream_event","event":{"type":"content_block_stop","index":1},"session_id":"333b008c-7453-4ac1-8f9c-a3175d4db016","parent_tool_use_id":null,"uuid":"fe28fe7a-485b-40a8-83a0-4d14f7fc3764"}
```

These raw `stream_event` JSON objects (with `content_block_delta`, `content_block_stop`, `message_delta`, etc.) should be parsed and formatted into readable chat messages, not displayed as-is. The chat is essentially unusable because the signal is buried under a mountain of noise.

## Expected Behavior

- Agent streaming output is formatted as clean, easy-to-read human chat
- Raw JSON stream events are parsed and converted to human-readable messages (text, tool calls, step transitions)
- Agent text appears naturally in the chat
- Tool calls and results are clearly labeled
- The user can actually follow what the agent is doing

## Actual Behavior

- Raw Anthropic API stream events (`stream_event`, `content_block_delta`, `message_delta`, etc.) are printed verbatim to the chat
- Occasional readable snippets appear (like "✓ agent requested server-side handoff") but are overwhelmed by JSON
- The Agent tab is essentially unreadable and unusable

## Acceptance Criteria

- [ ] Agent streaming output from Claude Code is parsed and formatted into readable chat messages
- [ ] Raw JSON stream events are not displayed in the chat output
- [ ] Agent text responses appear as clean messages
- [ ] Tool calls and tool results are clearly presented
- [ ] Agent step transitions/milestones are shown (e.g., "step start", "step complete")
- [ ] The streaming output remains readable throughout the response, not only after completion
- [ ] Verified with a real Claude Code agent run (not just unit tests)
- [ ] `repoos check` passes

## Implementation Notes

- This may be related to task 0109 ("Stream claude code output as structured events") which was marked as review but may not have been fully implemented
- Check if the event parsing/formatting pipeline in the UI is correctly handling the stream events
- The streaming format uses Anthropic Messages API event types: `content_block_delta`, `content_block_stop`, `message_delta`, etc.
- Unrecognized or non-JSON lines should fall back gracefully

## Related

- 0109 — Stream claude code output as structured events (marked as review, may be incomplete)
- 0045 — Render agent output opencode-style via structured JSON events

## Activity

- 2026-08-13T00:00:00Z · created from user report about unreadable chat output
- 2026-08-13T06:30:19Z · status ready→active, branch
- 2026-08-13T09:46:04Z · watchdog: automatic resume attempted
- 2026-08-13T09:51:04Z · watchdog: escalated to needs_input · handoff signal was not detected after the automatic resume · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
- 2026-08-13T10:52:09Z · status active→review
