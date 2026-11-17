---
id: "1149"
title: "Checks mobile header: make overview and page actions fit the narrow layout"
type: chore
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/checks-mobile-header-make-overview-and-p
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-17T03:06:39Z"
updated_at: "2026-11-17T11:12:56Z"
---
## Problem
At 390×844 on /checks, explanatory copy occupies about five lines while two help/config links sit in a narrow right column and wrap awkwardly. The header then competes with a tab row and the empty-state panel.

## Desired UX
The Checks heading, concise purpose and key actions scan in a predictable order on narrow screens.

## Acceptance criteria
- At 390px and 320px, introductory copy is concise.
- Help and configuration actions have touch-sized targets and do not form a narrow side column.
- Tabs remain reachable and desktop behavior is preserved.

## Notes for AI
Use the attached phone screenshot. Inspect both the empty state and a populated check-history state, in light and dark themes.

## Shots
```json
[
{
"label": "Checks overview on mobile",
"target": "default",
"route": "/checks?tab=runs",
"highlight": ".ck-head"
},
{
"label": "Checks history on mobile",
"target": "default",
"route": "/checks?tab=runs",
"highlight": ".ck-head",
"state": "checks:timings"
}
]
```

## Screenshots

![Checks at 390×844: intro copy and links compete in narrow header](/api/tasks/1149/attachments/att_6e8da9e6-d6b1-430f-b2bc-9d1dd9b2386e.png)

## Activity

- 2026-11-17T03:06:39Z · created · t@t
- 2026-11-17T03:06:41Z · screenshots
- 2026-11-17T03:06:42Z · needs_input
- 2026-11-17T03:07:51Z · body: Problem (added); Desired UX (added); Acceptance criteria (added); Notes for AI (added)
- 2026-11-17T08:14:31Z · needs_input
- 2026-11-17T11:09:59Z · cli_override, model_override
- 2026-11-17T11:10:01Z · status inbox→ready
- 2026-11-17T11:10:04Z · status ready→active, branch
- 2026-11-17T11:11:08Z · body
- 2026-11-17T11:12:56Z · body
