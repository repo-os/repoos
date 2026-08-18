---
id: "0251"
title: Preserve original freeform prompt in task file and create draft before PM processing
type: feature
status: done
priority: p2
area: server
assigned_to: ai
created_by: ""
branch: feat/preserve-original-freeform-prompt-in-tas
created_at: "2026-08-18T06:44:31Z"
updated_at: "2026-08-18T08:16:26Z"
---
## Problem

When a user creates a task via freeform input, the original prompt text is sent to the PM agent which rewrites it into a structured task file. If the PM agent fails, produces bad output, or is slow/unavailable, the original prompt is lost — it's never stored anywhere (not logged, not persisted in the task file). Task #0250 is an example: the prompt was lost and only a stub task was created.

## Desired UX

1. When the user clicks "Create" in freeform mode, the server **immediately** creates a draft task with:
   - A title derived from the user's prompt (existing `explanationTitle()` logic)
   - A body containing the user's original prompt text under a `## Original prompt` section
   - Status: `draft`
2. The PM agent then runs asynchronously to flesh out the task body (problem, desired UX, acceptance criteria, etc.), replacing the draft body with the structured version.
3. If the PM agent fails, the draft with the original prompt survives — the user never loses their input.
4. The `## Original prompt` section is preserved in the final task even after the PM agent runs, so there's always an audit trail of what the user actually asked for.

## Acceptance criteria

- [ ] Freeform task creation creates a draft task with `## Original prompt` section containing the raw user text BEFORE the PM agent runs
- [ ] The PM agent then updates the task body, keeping the `## Original prompt` section intact
- [ ] If the PM agent fails, the draft task remains with the original prompt preserved
- [ ] If no PM agent is configured, the task is created as a draft with the original prompt (existing fallback behavior, just needs the `## Original prompt` heading)
- [ ] The existing "Save as draft" client-side path also includes the `## Original prompt` section
- [ ] No changes to the client-side UI — this is a server-side flow change only

## Notes for AI

Key files to modify:
- `src/server/routes/tasks.ts` — the `createFreeformTask` handler (lines 83-176): restructure to create draft first, then spawn PM agent
- `src/server/freeform.ts` — `pmPrompt()` and `parseGeneratedTask()`: ensure `## Original prompt` section is preserved in the PM output parsing
- `src/core/repoos.ts` — `createTask()`: may need to accept an `originalPrompt` field to include in the initial draft body

The current flow is: receive prompt → spawn PM agent → parse output → create task. The new flow should be: receive prompt → create draft task with original prompt → spawn PM agent asynchronously → update task body with structured output (keeping original prompt section).

## Activity

- 2026-08-18T06:46:45Z · body
- 2026-08-18T07:28:55Z · status inbox→ready
- 2026-08-18T07:30:49Z · status ready→active, branch
- 2026-08-18T07:49:19Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
- 2026-08-18T08:16:26Z · status review→done, release:success
