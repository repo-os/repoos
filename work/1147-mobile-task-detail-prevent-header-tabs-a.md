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
updated_at: "2026-11-17T03:06:30Z"
---
At 390×844, /work?task=1146&tab=changes shows the task title and actions packed into a three-column header, the tab row clipped at the right edge, and the preview-target helper wrapping one or two words per line. This is distinct from the task drawer entry-point/read-only issue addressed by #1137. Improve narrow-screen hierarchy and wrapping so title, close/back, state actions, target selector, and all tabs remain readable and reachable without horizontal scrolling.\n\nAcceptance: at 390px and 320px widths, title and primary actions have clear hierarchy; helper copy wraps at a readable line length or is removed; all tabs remain reachable; no page-level or component-level accidental horizontal clipping; desktop remains unchanged.

## Screenshots

![Task detail at 390×844: compressed header, clipped tabs and narrow preview helper](/api/tasks/1147/attachments/att_e9641dca-402a-4402-8579-dbbac305c980.png)

## Activity

- 2026-11-17T03:06:27Z · created · t@t
- 2026-11-17T03:06:29Z · screenshots
- 2026-11-17T03:06:30Z · needs_input
