---
id: "0310"
title: Add debug tab to task panel
type: feature
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: ""
created_at: "2026-08-27T06:18:58Z"
updated_at: "2026-08-27T06:20:50Z"
---
## Problem

The task panel currently lacks visibility into internal state changes, events, and logs relevant to the task's execution. This makes debugging difficult when issues arise (e.g., MTD failures, errors) as developers must rely on external tools or guesswork to understand what happened.

## Desired UX

A new "Debug" tab appears next to the existing "Tokens" tab in the task panel. Clicking this tab reveals:
- Chronological list of state changes with timestamps
- Key events during task lifecycle (start, progress updates, completion/failure)
- Relevant logs associated with the task (errors, warnings, debug info)
- Clear indication when failures occur (e.g., MTD failure markers)

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

## Notes for AI

- Focus on frontend changes in the web area only
- Reuse existing logging infrastructure where possible
- Assume task IDs can be used to filter relevant logs
- Use standard UI components for tabs and lists
- Preserve existing task panel functionality
- Ensure debug data is loaded efficiently (lazy-load if needed)

## Scope

This task covers:
- Adding the debug tab UI
- Displaying state changes and events
- Integrating relevant log display

Deferred:
- Backend logging improvements
- Persistent storage of debug sessions
- Advanced filtering/search within debug view

## Original prompt

Let's add a debug tab to the task panel next to the tokens tab. In this debug tab we can show all the state changes/events and timestamps and even show relevant logs to the task (e.g. if MTD failed or there's an error etc)

## Activity

- 2026-08-27T06:20:50Z · status draft→inbox, title, area, body
