---
id: "1150"
title: "Stories mobile cards: preserve enough title and summary to identify work"
type: chore
status: active
priority: p3
area: web
assigned_to: ai
created_by: t@t
branch: feat/stories-mobile-cards-preserve-enough-tit
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-17T03:08:02Z"
updated_at: "2026-11-17T11:40:56Z"
---
## Problem
At 390×844 on /stories, story titles and summaries are truncated with ellipses and the nested task list truncates most long task names. The compact cards show counts and progress but make it difficult to tell which tasks need attention without opening the story.

## Desired UX
Story cards expose enough of the story name and active task names to identify the work, while keeping progress and status easy to scan on a phone.

## Acceptance criteria
- At 390px and 320px, long story titles and task names retain useful identifying text or provide a clear expansion affordance.
- Progress and status counts remain visible.
- Scrolling and touch targets remain comfortable; desktop layout is preserved.

## Notes for AI
Use the attached phone screenshot and inspect a story with a long description and several active tasks in both themes.

## Shots
```json
[
{
  "label": "Stories cards with readable mobile task names",
  "target": "default",
  "route": "/stories",
  "highlight": ".story-live-title"
}
]
```

## Screenshots

![Stories at 390×844: several task names and story summaries truncate before identification](/api/tasks/1150/attachments/att_f93e546a-f3e4-4e21-b6d3-205d8f53f40f.png)

## Activity

- 2026-11-17T03:08:02Z · created · t@t
- 2026-11-17T03:08:03Z · screenshots
- 2026-11-17T11:39:57Z · cli_override, model_override
- 2026-11-17T11:40:00Z · status inbox→ready
- 2026-11-17T11:40:01Z · status ready→active, branch
- 2026-11-17T11:40:56Z · body
