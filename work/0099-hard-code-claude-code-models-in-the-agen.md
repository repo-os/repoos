---
id: "0099"
title: Hard-code Claude Code models in the agents dropdown
type: feature
status: review
priority: p2
area: ui
assigned_to: ai
created_by: ""
branch: feat/hard-code-claude-code-models-in-the-agen
created_at: "2026-08-11T16:13:01Z"
updated_at: "2026-08-12T01:17:30Z"
---
## Problem

The Claude Code model dropdown on the agents page does not provide the required fixed set of model options. Users need a predictable list of supported choices when configuring a Claude Code agent.

## Desired UX

When Claude Code is selected on the agents page, its model dropdown shows exactly these options:

- default
- opus
- sonnet
- haiku

## Acceptance criteria

- [ ] The Claude Code model dropdown includes `default`, `opus`, `sonnet`, and `haiku`.
- [ ] The options are hard-coded rather than loaded dynamically.
- [ ] The Claude Code dropdown does not show model options beyond those four.
- [ ] The change applies to the agents page.

## Notes for AI

- Limit the change to the Claude Code model dropdown on the agents page.
- Preserve the option names and ordering exactly as stated: `default`, `opus`, `sonnet`, `haiku`.
- Assume other agent providers and their model dropdowns should remain unchanged.

## Activity

- 2026-08-11T16:13:01Z · created · unknown
- 2026-08-11T16:13:38Z · status inbox→ready
- 2026-08-11T16:42:45Z · status ready→active, branch
- 2026-08-11T16:43:29Z · status active→ready
- 2026-08-11T17:12:59Z · status ready→active
- 2026-08-12T01:17:30Z · status active→review
