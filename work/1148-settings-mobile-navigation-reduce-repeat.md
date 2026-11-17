---
id: "1148"
title: "Settings mobile navigation: reduce repeated topic-chip density"
type: chore
status: inbox
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Problem, Desired UX, Acceptance criteria, Notes for AI"
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-17T03:06:33Z"
updated_at: "2026-11-17T03:06:37Z"
---
At 390×844 on /settings, page navigation first appears as a six-item grid and then as a long wrap of topic chips (Themes, Activity animation, General, Performance, Model routing, Close-out, Automation & approval, Screenshots, Attachments, Background service, Publishing, Release emails, Remote validation, Board, and more). Both layers consume most of the initial viewport before the selected setting content. Rework the mobile information architecture so users can reach a setting category and its controls with less scanning and scrolling, while keeping search and section context available.\n\nAcceptance: at 390px, the initial view presents one clear navigation layer and useful selected-section content; secondary topics remain discoverable; keyboard/touch navigation and active state remain clear; desktop composition is unchanged.

## Screenshots

![Settings at 390×844: two stacked navigation layers dominate first view](/api/tasks/1148/attachments/att_a0b17ef0-cf2f-4c7b-8d34-36bcc937fede.png)

## Activity

- 2026-11-17T03:06:33Z · created · t@t
- 2026-11-17T03:06:35Z · screenshots
- 2026-11-17T03:06:37Z · needs_input
