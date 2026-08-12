---
id: "0116"
title: Improve agent streaming output formatting
type: bug
status: inbox
priority: p2
area: cli
assigned_to: ai
created_by: ""
branch: ""
model_override: gpt-5.6-terra
created_at: "2026-08-12T04:16:02Z"
updated_at: "2026-08-12T06:14:28Z"
---
## Problem

OpenCode agent output is currently presented in a readable chat format, but output from Codex and potentially other agents is not consistently formatted. Raw or inconsistent streaming output makes agent conversations harder for humans to follow.

## Desired UX

Every supported agent should display streamed output as clean, easy-to-read human chat. Codex and other agents should provide a presentation quality comparable to the existing OpenCode output while preserving agent-specific behavior where necessary.

## Acceptance criteria

- [ ] Test the streaming output of every supported agent.
- [ ] Identify agents whose output is not rendered as clear, readable chat.
- [ ] Add or update agent-specific streaming output adapters where needed.
- [ ] Codex streamed output is formatted as clear, easy-to-read chat.
- [ ] All other supported agents produce similarly readable chat output.
- [ ] OpenCode's existing output quality is preserved.
- [ ] Streaming output remains readable throughout a response, not only after completion.

## Notes for AI

- Use the current OpenCode output as the quality reference.
- Assume agent-specific adapters are appropriate when output formats differ; reuse an existing shared formatter where an agent already emits a compatible format.
- Inspect and test all currently supported agents rather than assuming the issue is limited to Codex.
- Keep changes focused on human-facing streaming output formatting.

## Scope

This task covers testing and improving the chat presentation of streamed output for currently supported agents. It does not add support for new agents or change their underlying behavior.

## Activity

- 2026-08-12T04:16:02Z · created · unknown
- 2026-08-12T06:14:28Z · model_override
