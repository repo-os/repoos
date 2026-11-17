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
updated_at: "2026-11-17T03:07:47Z"
---
## Problem
At 390×844, /work?task=1146&tab=changes packs the task title and actions into a narrow header, clips the tab row, and wraps preview target help one or two words per line. This is distinct from the task detail entry-point issue in #1137.

## Desired UX
Task details remain easy to scan and operate on narrow phones, with title, status, primary actions and tabs clearly discoverable.

## Acceptance criteria
- At 390px and 320px widths, title and primary actions have clear hierarchy.
- Preview helper copy wraps at a readable line length or is removed.
- Every tab remains reachable without accidental horizontal clipping.
- Desktop behavior is preserved.

## Notes for AI
Use the attached 390×844 screenshot as rendered evidence. Inspect both themes and long task titles.

## Screenshots

![Task detail at 390×844: compressed header, clipped tabs and narrow preview helper](/api/tasks/1147/attachments/att_e9641dca-402a-4402-8579-dbbac305c980.png)

## Activity

- 2026-11-17T03:06:27Z · created · t@t
- 2026-11-17T03:06:29Z · screenshots
- 2026-11-17T03:06:30Z · needs_input
- 2026-11-17T03:07:47Z · body: Problem (added); Desired UX (added); Acceptance criteria (added); Notes for AI (added)
