---
id: "0088"
title: Animate task state transitions
type: feature
status: review
priority: p2
area: ui
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-11T13:32:49Z"
updated_at: "2026-08-11T15:37:46Z"
---
## Problem

When a task is moved to its next state, the interface does not provide enough visual feedback to make the change obvious. This affects transitions initiated from both the open task panel and the card view, leaving users unsure whether their action succeeded.

## Desired UX

Moving a task to its next state produces a clear, creative animation in both the open task panel and the card view. The animation should make the successful state change immediately noticeable, potentially using a wave of color or a similarly expressive visual treatment.

## Acceptance criteria

- [ ] Advancing a task from the open task panel triggers a clearly visible transition animation.
- [ ] Advancing a task from the card view triggers a clearly visible transition animation.
- [ ] The animation communicates that the task successfully moved to its next state.
- [ ] The animation appears on the task affected by the action.
- [ ] The open task panel and card view use a visually consistent transition treatment.
- [ ] Failed transitions show the existing error feedback and never play the success animation.
- [ ] With `prefers-reduced-motion: reduce`, the UI uses a brief non-motion highlight or equivalent accessible confirmation.

## Notes for AI

- Focus on UI feedback for successful task state transitions.
- Be creative with the visual treatment; a wave of color is a suggested direction, not a strict requirement.
- Assume the existing state-transition behavior remains unchanged and only its visual feedback needs enhancement.
- Keep the animation noticeable enough to resolve uncertainty without introducing new interaction steps.
- Trigger the effect only after the server confirms the state change. If the card
  immediately leaves the current column, use a short leaving/ghost transition so
  the feedback remains attached to the affected task rather than flashing on an
  unrelated destination.

## Scope

This task covers animation feedback when a task advances to its next state from the open task panel or card view. Changes to the task workflow, state model, or available transition actions are deferred.

## Activity

- 2026-08-11T13:32:49Z · created · unknown
- 2026-08-11T13:33:09Z · status inbox→ready
- 2026-08-11T15:37:46Z · updated · define success timing, failure behavior, and reduced-motion fallback
