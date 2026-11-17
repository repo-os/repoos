---
id: "1147"
title: "Mobile task detail: prevent header, tabs and preview help from clipping"
type: bug
status: inbox
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Problem, Desired UX, Acceptance criteria, Notes for AI"
priority: p1
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-17T03:06:27Z"
updated_at: "2026-11-17T03:32:32Z"
---
## Problem
At 390×844, the mobile task detail tab strip continues beyond the viewport and the preview-target helper wraps one or two words per line beside its selector. The cramped title/header alignment and Mission Control heading alignment are owned by #1145 and are excluded from this follow-up.

## Desired UX
Task detail tabs and preview-target guidance remain readable and reachable on narrow phones.

## Acceptance criteria
- At 390px and 320px, all task detail tabs are reachable without accidental clipping.
- Preview helper copy wraps at a readable line length or is removed when redundant.
- The header title, close control and title alignment remain within #1145 scope.
- Desktop behavior is preserved.

## Notes for AI
Use the attached 390×844 screenshot. Inspect both themes and a long task title. Do not change the title/header or Mission Control alignment covered by #1145.

## Screenshots

![Task detail at 390×844: compressed header, clipped tabs and narrow preview helper](/api/tasks/1147/attachments/att_e9641dca-402a-4402-8579-dbbac305c980.png)

## Activity

- 2026-11-17T03:06:27Z · created · t@t
- 2026-11-17T03:06:29Z · screenshots
- 2026-11-17T03:06:30Z · needs_input
- 2026-11-17T03:07:47Z · body: Problem (added); Desired UX (added); Acceptance criteria (added); Notes for AI (added)
- 2026-11-17T03:32:32Z · body: Problem (added 1, removed 1); Desired UX (added 1, removed 1); Acceptance criteria (added 3, removed 3); Notes for AI (added 1, removed 1)
