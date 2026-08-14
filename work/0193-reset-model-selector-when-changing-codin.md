---
id: "0193"
title: Reset model selector when changing coding agent
type: bug
status: inbox
priority: p1
area: ui
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-14T10:03:13Z"
updated_at: "2026-08-14T10:03:13Z"
---
## Problem

The model selector doesn't work when switching between coding agents. Additionally, when an agent is changed, the previously selected model persists in the dropdown even though it's no longer valid for the new agent. This creates a confusing UX where users see an invalid model selected.

## Desired UX

When a user changes the coding agent, the model selector should automatically reset to the default model for that agent. No previously selected models should carry over between agents.

## Acceptance criteria

- [ ] Model selector clears/resets when coding agent is changed
- [ ] Default model for the newly selected agent is automatically applied
- [ ] No invalid models appear in the dropdown after agent selection changes
- [ ] Each coding agent has a defined default model
- [ ] Model selection works correctly for all coding agents

## Notes for AI

- Identify the state management for model selector and agent selection
- Locate agent change event handlers and wire in model reset logic
- Define default models for each coding agent (or identify if this is already defined elsewhere)
- Ensure the model dropdown is properly filtered/updated when agent changes
- The change likely involves UI state management and possibly agent configuration

## Activity

- 2026-08-14T10:03:13Z · created · unknown
