---
id: "0209"
title: Show reviewer thinking state in task panel
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/show-reviewer-thinking-state-in-task-pan
created_at: "2026-08-15T04:35:11Z"
updated_at: "2026-08-15T07:44:58Z"
---
## Problem

When a task lands in `review` and the reviewer agent runs, the task panel gives
the user no indication that the reviewer is actually working. There is no
visible "thinking" or "working" state while the review is in progress, so the
user cannot tell whether the reviewer is running, stuck, or idle. This is
confusing — the user asked "why doesn't the reviewer in the task panel show as
it's thinking and working?" indicating the current UI silently does nothing
visible while review happens.

## Desired UX

The task panel should show an obvious, live indicator whenever the reviewer
agent is actively running on that task. While the review is in progress, the
panel should display a clear "thinking" / "working" state (e.g. a spinner or
animated status label, message such as "Reviewer is reviewing this task…").
When the review finishes, the indicator clears and the normal review report /
actions appear as they do today.

## Acceptance criteria

- [ ] While the reviewer agent is running on a task in `review`, the task panel shows a visible "thinking"/"working" indicator (e.g. spinner and status text).
- [ ] The indicator reflects the live status of the in-flight review, not just a static label.
- [ ] When the review completes, the indicator is removed and the review report appears as usual.
- [ ] The indicator works server-side consistently with how reviews are triggered and streamed; refreshing the panel resumes showing the correct state.
- [ ] No new runtime dependency is introduced (zero runtime dependencies constraint holds).

## Notes for AI

- The panel is the web UI (Vite + Vue 3 SFC under `src/ui-app`).
- The review flow is triggered automatically when a task enters `review` and is server-owned; the UI needs to surface that in-flight state (likely via the existing server/report data source — investigate how review status is currently exposed before adding anything).
- Investigate where the reviewer's run status is tracked (server side) and how the UI currently receives the review report, then connect a "running" state through that same channel.
- Do not invent a new persistence format or add runtime dependencies.
- If the exact mechanism for streaming the running state is ambiguous, pick the approach most consistent with the existing review-report plumbing and state the assumption.
- After any UI change, rebuild (`bun run build:ui` or `bun run build`) and verify with the managed preview probe before reporting done.
- Get `repoos check` green before setting `status: review`.

## Scope

- Covers surfacing the in-flight "thinking/working" state of the reviewer in the task panel.
- Deferred: any change to how the reviewer agent itself executes or reports.

## Related

- AGENTS.md "Review and sign-off" section (reviewer that runs automatically when a task lands in `review`).

## Activity

- 2026-08-15T04:35:11Z · created · unknown
- 2026-08-15T05:46:04Z · status inbox→ready
- 2026-08-15T05:46:05Z · status ready→active, branch
- 2026-08-15T05:56:19Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
- 2026-08-15T07:44:44Z · status review→ready
- 2026-08-15T07:44:58Z · status ready→active
