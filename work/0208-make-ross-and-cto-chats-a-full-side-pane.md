---
id: "0208"
title: Make Ross and CTO chats a full side panel
type: feature
status: ready
needs_merge: true
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/make-ross-and-cto-chats-a-full-side-pane
model_override: default
created_at: "2026-08-15T04:12:14Z"
updated_at: "2026-08-16T10:30:14Z"
---
## Problem

The Ross and CTO chats are currently shown in a small, constrained view. They
feel cramped compared to the task panel, making them hard to read and use for
an extended conversation. The inconsistent sizing between these chat panels and
the task panel gives the interface a disjointed feel and limits how much of a
conversation can be seen at once.

## Desired UX

Both the Ross chat and the CTO chat should be presented as a full side panel
that is the same size as the existing task panel. This gives chats parity with
the task panel, so they occupy the same visual space, share the same dimensions,
and feel like first-class panels rather than secondary, undersized views.

## Acceptance criteria

- [ ] The Ross chat and the CTO chat are both rendered in a full side panel
      layout.
- [ ] The side panel for each chat is the same size as the existing task panel.
- [ ] Opening/activating a chat shows it in this full-size side panel.
- [ ] The chat remains fully usable and readable in the new panel size (no
      clipping, scrolling works for longer conversations).

## Notes for AI

- Only apply sizing/layout changes that make the chat panels match the task
  panel size; there is no request to change the task panel itself.
- The "same size as the task panel" requirement is about the panel dimensions
  and layout. Where anything is ambiguous, mirror the task panel's existing
  sizing and spacing as the default.
- This is a UI-only change. No chat behavior, message handling, or backend
  logic should be altered.
- After the change, rebuild (`bun run build:ui`, or `bun run build`) and verify
  with a browser probe before reporting done, per the repo conventions.
- Touch only the UI source under `src/ui-app`; do not modify core, server, or
  CLI.

## Scope

- In scope: making the Ross chat and CTO chat full side panels sized to match
  the task panel.
- Deferred: any changes to chat behavior, features, or the task panel itself.
  Also deferred are any other panels or new panel types not mentioned.

## Activity

- 2026-08-15T04:12:14Z · created · unknown
- 2026-08-15T04:12:32Z · status inbox→ready
- 2026-08-15T04:12:34Z · status ready→active, branch
- 2026-08-15T04:35:02Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
- 2026-08-15T10:46:42Z · status review→active
- 2026-08-15T10:47:32Z · status active→review
- 2026-08-15T11:02:06Z · status review→done, release:success
- 2026-08-16T09:56:13Z · status done→ready
- 2026-08-16T10:30:14Z · needs_merge
