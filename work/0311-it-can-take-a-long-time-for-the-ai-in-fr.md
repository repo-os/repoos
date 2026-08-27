---
updated_at: "2026-08-27T09:44:02Z"
review_passes: 1
id: "0311"
title: Improve UX for Long-Running Freeform Task Creation
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/improve-ux-for-long-running-freeform-tas
review_model_override: deepinfra/Qwen/Qwen3-Coder-480B-A35B-Instruct-Turbo
created_at: "2026-08-27T06:23:56Z"
---
## Problem

When users create new tasks via the freeform new task feature, the AI can take a significant amount of time to generate the complete task. During this period, the new task pane remains blocked, preventing users from initiating other actions. This creates a poor user experience as users are left waiting without clear feedback or alternative options.

## Desired UX

Users should be informed that task creation may take a few minutes and provided with clear options:
1. Continue using the system while the task is being created in the background
2. Create additional tasks if needed
3. Navigate away from the new task pane without losing their current task creation progress

The system should indicate that the task creation is ongoing and will be automatically updated when ready, allowing users to continue working without feeling blocked.

## Acceptance criteria

- [ ] Display a clear message indicating task creation may take a few minutes
- [ ] Show options for users to either continue working or create new tasks
- [ ] Allow the new task creation to proceed in the background
- [ ] Enable users to navigate away from the new task pane
- [ ] Ensure the task appears correctly once creation is complete
- [ ] Maintain task creation progress when users return to the task list

## Notes for AI

- Focus on UI/UX improvements in the web frontend
- Modify the task creation flow to be non-blocking
- Consider implementing a task queue or background processing indicator
- Ensure compatibility with existing task management features
- Test the solution with various task complexity levels

## Scope

This task focuses solely on improving the user experience during long-running task creation. It does not include optimizing the AI processing time itself or changing the underlying task creation mechanics.

## Original prompt

It can take a long time for the AI in freeform new task to create the task, and the user feels blocks on the new task pane waiting, so we should tell the customer it may take a few minutes and what actions they can take while they wait, e.g. create a new task (because currently the new task pane stays blocked with the current task -- so can we move that to the background and let the user create a new task if they want?). or if they don't want to create a new task we can tell the user they can go do something else in the system, don't worry this task will get automatically created and updated when it's ready.

## Activity

- 2026-08-27T06:24:32Z · status draft→inbox, title, area, body
- 2026-08-27T09:31:45Z · review_model_override
- 2026-08-27T09:31:46Z · status inbox→ready
- 2026-08-27T09:31:55Z · status ready→active, branch
- 2026-08-27T09:43:46Z · status active→review

