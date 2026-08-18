---
id: "0249"
title: Refactor coding agent and model selector into a modal
type: refactor
status: review
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/refactor-coding-agent-and-model-selector
model_override: default
created_at: "2026-08-17T14:28:17Z"
updated_at: "2026-08-18T02:25:16Z"
---
# Refactor coding agent and model selector into a modal

## Problem

The Coding Agent selector and the Model Selector are used all over the
place in the web UI, and each embedded widget manages its own selection
state and layout. This duplication makes the controls inconsistent and
hard to maintain. There is no single, unified way to pick both a coding
agent and one of its models.

## Desired UX

The user should be able to choose a coding agent and a model from one
unified, generously sized modal dialog. The existing scattered coding
agent + model selector controls in the page are replaced by a single
button-like control labeled `[Coding Agent + Model]` that, when clicked,
opens the new modal.

Inside the modal:

- A **horizontal picker** at the top for choosing the coding agent.
- Below it, a **scrollable list** of the models available to the selected
  coding agent.
- The model list is **searchable**, so the user can filter models by
  typing.

Selecting values in the modal updates the selection that the page-level
`[Coding Agent + Model]` control reflects.

## Acceptance criteria

- [ ] A single `[Coding Agent + Model]` control replaces the current
      coding agent + model selector widgets wherever they appear.
- [ ] Clicking the control opens a generously sized modal.
- [ ] The modal shows a horizontal picker for selecting the coding agent.
- [ ] Below the picker, a scrollable list shows the models available for
      the selected coding agent.
- [ ] The model list supports search/filtering by text.
- [ ] Selecting a coding agent and a model in the modal updates the
      state exposed through the `[Coding Agent + Model]` control.
- [ ] The existing scattered selection widgets are removed in favor of
      the new control.

## Notes for AI

- This is a refactor of existing selector UI; rework the shared component
  rather than adding a new standalone feature.
- The modal must be **generously sized** — plan a large dialog, not a
  small popover.
- Reuse the existing data sources (available coding agents and their
  models) already consumed by the current selectors; no new endpooints or
  runtime dependencies are introduced.
- After any UI change, rebuild (`bun run build:ui` or `bun run build`) and
  verify via a browser probe before reporting done.
- Assumptions made (not implied by the input, chosen as reasonable
  defaults): the modal selection is persisted back to the same shared
  state the current selectors use, so the rest of the app observes the
  choice unchanged; and the `[Coding Agent + Model]` label uses the display
  values of the currently selected agent and model.
- Do not change the underlying selection state shape or any
  server/model-providing code unless required.

## Scope

- Covers: the unified modal, the horizontal agent picker, the searchable
  scrollable model list, and replacing the existing selectors with the
  `[Coding Agent + Model]` control.
- Deferred: any change to how agents/models are fetched or enumerated;
  any redesign of other unrelated selector patterns.

## Related

- None provided. Existing coding agent / model selector components under
  `src/ui-app/` are the primary touch points.

## Activity

- 2026-08-17T14:28:17Z · created · unknown
- 2026-08-17T14:28:25Z · model_override
- 2026-08-17T14:32:14Z · status inbox→ready
- 2026-08-17T15:09:33Z · status ready→active, branch
- 2026-08-17T15:30:20Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
- 2026-08-17T15:30:20Z · status review→active
- 2026-08-18T02:25:16Z · status active→review
