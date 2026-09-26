---
id: "0506"
title: Currently there are many more tool calls than actual mess…
type: feature
status: draft
priority: p2
area: general
assigned_to: ai
created_by: hello@repoos.org
branch: ""
created_at: "2026-09-26T01:56:07Z"
updated_at: "2026-09-26T01:56:08Z"
---
Currently there are many more tool calls than actual messages in the AI chat logs, let's combine multiple tool calls in a row into a single entry in the chat, which can be expanded by the user to see each individual tool call and result. Put a count on the tool call row so the user can easily see how many tool calls are in that row. Also let's split out the counts for success and error tool calls (green for success and red for error). Make sure to do this in all AI chats and try to re-use logic/components where necessary. Also make sure each chat row has a last updated timestamp (e.g. if 4 tool calls happen in a row then the timestamp on that row is the latest). Also I'm not really sure what "continue" means and why it has it's own row in the chat with a timestamp for "tool calls". let's just make the actual tool call rows be timestamped, and remove any extraneous rows that don't show useful content (or compress into the single tool call row with the other tool calls. Also make this this works for all coding agents available in this system: opencode, claude code, codex, github copilot, cursor, kiro etc

## Original prompt

Currently there are many more tool calls than actual messages in the AI chat logs, let's combine multiple tool calls in a row into a single entry in the chat, which can be expanded by the user to see each individual tool call and result. Put a count on the tool call row so the user can easily see how many tool calls are in that row. Also let's split out the counts for success and error tool calls (green for success and red for error). Make sure to do this in all AI chats and try to re-use logic/components where necessary. Also make sure each chat row has a last updated timestamp (e.g. if 4 tool calls happen in a row then the timestamp on that row is the latest). Also I'm not really sure what "continue" means and why it has it's own row in the chat with a timestamp for "tool calls". let's just make the actual tool call rows be timestamped, and remove any extraneous rows that don't show useful content (or compress into the single tool call row with the other tool calls. Also make this this works for all coding agents available in this system: opencode, claude code, codex, github copilot, cursor, kiro etc

## Screenshots

![Screenshot-2026-09-26-at-08.47.24](/api/tasks/0506/attachments/screenshot-1.png)
![Screenshot-2026-09-26-at-08.40.54](/api/tasks/0506/attachments/screenshot-2.png)

## Activity

- 2026-09-26T01:56:07Z · created · hello@repoos.org
- 2026-09-26T01:56:08Z · screenshots
- 2026-09-26T01:56:08Z · screenshots
