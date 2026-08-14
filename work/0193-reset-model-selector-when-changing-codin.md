---
id: "0193"
title: Reset model selector when changing coding agent
type: bug
status: review
priority: p1
area: ui
assigned_to: ai
created_by: ""
branch: feat/reset-model-selector-when-changing-codin
cli_override: claude code
created_at: "2026-08-14T10:03:13Z"
updated_at: "2026-08-14T12:00:02Z"
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
- 2026-08-14T10:06:40Z · status inbox→ready
- 2026-08-14T10:57:34Z · status ready→active, branch
- 2026-08-14T11:06:34Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
- 2026-08-14T12:00:02Z · cli_override
