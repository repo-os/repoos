---
id: "0186"
title: Update PM tab to match Agent tab layout with agent/model selector
type: feature
status: ready
priority: p2
area: general
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-14T04:32:24Z"
updated_at: "2026-08-14T04:40:22Z"
---
## Summary

Update the PM (Project Management) tab in the task sidebar to match the visual layout and UX patterns of the Agent tab, including the agent/model selector. Both tabs should support auto-save functionality for model selection instead of requiring an explicit save button.

## Goals

- Align PM tab UI with existing Agent tab layout for consistency
- Add agent/model selector to PM tab (similar to Agent tab)
- Implement auto-save for both agent and model selectors in both tabs
- Improve UX by removing the need for a save button

## Acceptance Criteria

- [ ] PM tab visually matches Agent tab layout
- [ ] Agent/model selector is available and functional in PM tab
- [ ] Selecting an agent/model in PM tab auto-saves without user clicking save
- [ ] Selecting an agent/model in Agent tab auto-saves without user clicking save
- [ ] No broken functionality in existing Agent tab during implementation
- [ ] UI is consistent between both tabs (spacing, typography, component styling)

## Implementation Details

- Review current Agent tab component structure and styling
- Extract shared UI patterns into reusable components if needed
- Add agent/model selector to PM tab component
- Remove save button and implement auto-save behavior:
  - Listen to selector changes and persist immediately
  - Show brief confirmation (optional toast/feedback)
  - Handle errors gracefully
- Ensure selector state persists across tab switches and page reloads

## Testing

- Verify Agent tab selector still works and auto-saves
- Verify PM tab selector is present and functional
- Test auto-save by selecting different agents/models and confirming persistence
- Test state persistence on page refresh
- Check for any console errors or regressions

## Activity

- 2026-08-14T04:32:24Z · created · unknown
- 2026-08-14T04:40:19Z · status draft→inbox
- 2026-08-14T04:40:22Z · status inbox→ready
