---
id: "0099"
title: Hard-code Claude Code models in the agents dropdown
type: feature
status: ready
priority: p2
area: ui
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-11T16:13:01Z"
updated_at: "2026-08-11T16:13:38Z"
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
