---
id: "0310"
title: Add debug tab to task panel
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/add-debug-tab-to-task-panel
cli_override: claude code
model_override: sonnet
created_at: "2026-08-27T06:18:58Z"
updated_at: "2026-08-28T10:04:07Z"
dev_error_count: 1
---
## Problem

The task panel currently lacks visibility into internal state changes, events, and logs relevant to the task's execution. This makes debugging difficult when issues arise (e.g., MTD failures, errors) as developers must rely on external tools or guesswork to understand what happened.

This also covers a related, more specific gap: `repoos check` (build, typecheck, tests, UI smoke test) runs multiple times per task — the server re-verifies it before finalizing handoff into review ([handoff.ts](src/server/handoff.ts)'s `runCheck()`), and again as the actual merge gate onto `main` ([integration-orchestrator.ts](src/server/integration-orchestrator.ts)'s `validateCandidate`) — and today none of that is recorded anywhere: no duration, no pass/fail history, no visibility into a check that's currently running. The Debug tab is the natural home for it.

## Desired UX

A new "Debug" tab appears next to the existing "Tokens" tab in the task panel. Clicking this tab reveals:
- Chronological list of state changes with timestamps
- Key events during task lifecycle (start, progress updates, completion/failure)
- Relevant logs associated with the task (errors, warnings, debug info)
- Clear indication when failures occur (e.g., MTD failure markers)
- **Check history**: each `repoos check` run the server itself performed for this task (handoff-finalize check, MTD merge-gate check) listed with when it ran, how long it took, and pass/fail — same chronological list as the other events, not a separate widget
- **Live check output**: while one of those two checks is actively running for this task, the tab streams its stdout/stderr live instead of just showing a static "running" state — same pattern as the Control page's "Run full test suite" panel (`src/server/test-run.ts`'s `TestRunManager`, `src/ui-app/src/components/TestRunPanel.vue`), just scoped to this one task's check instead of a manual whole-repo run

The interface should be clean and filterable, allowing easy scanning of debug information without overwhelming the user.

## Acceptance criteria

- [ ] Debug tab added to task panel UI next to Tokens tab
- [ ] Tab shows chronological list of state changes with timestamps
- [ ] Events are displayed with clear labels and timing
- [ ] Relevant logs are shown for the task (filtered by task ID/context)
- [ ] Error states are visually highlighted
- [ ] Works for all task types (feature, bug, etc.)
- [ ] No performance impact on normal task operations
- [ ] Mobile-responsive layout maintained
- [ ] Each server-run `repoos check` for this task (handoff-finalize check, MTD merge-gate check) records start time, duration, and pass/fail outcome, and appears in the Debug tab's event list
- [ ] While one of those checks is actively running for this task, the Debug tab streams its live output in real time
- [ ] Past check runs remain visible/inspectable after they finish, not just the currently-running one

## Notes for AI

- Focus on frontend changes in the web area only, EXCEPT for the check-duration/live-output tracking, which needs backend instrumentation (see Scope) — that part touches `server` too
- Reuse existing logging infrastructure where possible
- Assume task IDs can be used to filter relevant logs
- Use standard UI components for tabs and lists
- Preserve existing task panel functionality
- Ensure debug data is loaded efficiently (lazy-load if needed)
- For the check tracking specifically: only the two checks RepoOS's own server spawns directly — `handoff.ts`'s `runCheck()` and `integration-orchestrator.ts`'s candidate check — can be instrumented this way, since the server directly owns those subprocesses. The engineer agent's own in-loop self-check (before it requests handoff) runs inside the agent's own sandboxed shell, not a server-spawned subprocess RepoOS observes directly — do not assume that one can be captured the same way; scope this task to the two server-run checks only, and say so explicitly if it comes up
- `test-run.ts`'s `TestRunManager` is a close but not identical model: it's a single global run with no task association. This needs a per-task version — likely keyed by task ID, alongside whatever event/state-change store already backs the rest of the Debug tab

## Scope

This task covers:
- Adding the debug tab UI
- Displaying state changes and events
- Integrating relevant log display
- Recording start time, duration, and pass/fail for the two server-run check invocations (handoff-finalize, MTD merge-gate), per task
- Streaming the live output of a check currently running for a given task, reusing the SSE-event-bus pattern from `test-run.ts`/`TestRunPanel.vue` but scoped per-task instead of global

Deferred:
- Capturing the engineer agent's own in-loop self-check (not server-observable the same way — see Notes for AI)
- Persistent storage of debug sessions
- Advanced filtering/search within debug view

## Original prompt

Let's add a debug tab to the task panel next to the tokens tab. In this debug tab we can show all the state changes/events and timestamps and even show relevant logs to the task (e.g. if MTD failed or there's an error etc)

## Activity

- 2026-08-27T06:20:50Z · status draft→inbox, title, area, body
- 2026-08-27T09:23:16Z · body — added check-duration + live check-log tracking to the Debug tab, per follow-up request
- 2026-08-27T09:31:19Z · status inbox→ready
- 2026-08-28T09:57:30Z · status ready→active, branch
- 2026-08-28T10:01:21Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-08-28T10:03:24Z · cli_override, model_override
- 2026-08-28T10:03:26Z · model_override
- 2026-08-28T10:04:07Z · needs_input
