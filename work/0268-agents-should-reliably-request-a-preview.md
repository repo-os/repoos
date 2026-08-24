---
id: "0268"
title: Do not auto-request previews; let the human request manually
type: bug
status: review
priority: p2
area: agent
assigned_to: ai
created_by: ""
branch: feat/do-not-auto-request-previews-let-the-hum
created_at: "2026-08-24T15:55:19Z"
updated_at: "2026-08-24T20:51:47Z"
---
## Problem
Preview URLs can now spin up much faster, so auto-requesting a preview before handoff is no longer needed. The original intent (always have a verified preview ready at handoff) is obsolete.

## Fix
Do the opposite of the original task: stop automatically requesting a preview before handoff. Leave preview requests to the human — the engineer agent should not automatically spin one up; the human can request one manually when they want it.

## Activity

- 2026-08-24T20:26:47Z · title, body
- 2026-08-24T20:30:47Z · status inbox→ready
- 2026-08-24T20:30:59Z · status ready→active, branch
- 2026-08-24T20:42:25Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
- 2026-08-24T20:42:26Z · status review→active
- 2026-08-24T20:51:46Z · status active→review
