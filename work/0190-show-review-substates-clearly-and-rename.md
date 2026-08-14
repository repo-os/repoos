---
id: "0190"
title: Show review substates clearly and rename running to coding
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/show-review-substates-clearly-and-rename
created_at: "2026-08-14T07:47:22Z"
updated_at: "2026-08-14T11:08:56Z"
---
## Problem

When a task is in review, it can be in different substates (reviewing, coding, waiting for human), but these aren't clearly visible to users. The substates indicate important workflow stages within the review process. Additionally, the "running" status label is imprecise—"coding" better describes what's actually happening.

## Desired UX

Task cards and the task sidebar clearly display which review substate a task is currently in:
- **reviewing** — review is in progress
- **coding** — reviewer is making code changes
- **waiting for human** — review has passed, needs human approval/action

All references to "running" status are renamed to "coding" throughout the application for consistency.

## Acceptance criteria

- [ ] Review substates (reviewing, coding, waiting for human) are visually distinct and labeled on task cards
- [ ] Review substates are displayed in the task sidebar
- [ ] All instances of "running" status renamed to "coding" across the codebase
- [ ] UI clearly differentiates between the three review states (via labels, icons, or colors)
- [ ] Changes apply consistently to both card and sidebar views

## Notes for AI

- Search for all occurrences of "running" status (likely in task state definitions, UI components, database references) and rename to "coding"
- Find where task card and sidebar components render status/state information
- Implement visual distinction for the three review substates—this may include labels, badges, or icon changes
- Assumption: "waiting for human" means the review logic has approved it but human action (merge, approval) is needed

## Scope

Covers: UI rendering of review substates, status terminology rename from running → coding
Defers: Changes to task state machine logic or how tasks transition between review states

## Activity

- 2026-08-14T07:47:22Z · created · unknown
- 2026-08-14T07:53:40Z · status inbox→ready
- 2026-08-14T10:57:48Z · status ready→active, branch
- 2026-08-14T11:08:56Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
