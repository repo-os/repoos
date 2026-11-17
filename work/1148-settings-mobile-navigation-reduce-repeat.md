---
id: "1148"
title: "Settings mobile navigation: reduce repeated topic-chip density"
type: chore
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/settings-mobile-navigation-reduce-repeat
created_at: "2026-11-17T03:06:33Z"
updated_at: "2026-11-17T04:02:53Z"
---
## Problem
At 390×844, /settings shows a six-item page navigation grid, followed by a long wrapping row of topic chips (Themes, Activity animation, General, Performance, Model routing, Close-out, Automation & approval, Screenshots, Attachments, Background service, Publishing, Release emails, Remote validation, Board, and more). Both layers consume most of the initial viewport before selected setting controls.

## Desired UX
A phone user can reach a setting category and its controls with less scanning and scrolling while retaining search and section context.

## Acceptance criteria
- At 390px the initial view presents one clear navigation layer and useful selected-section content.
- Secondary topics remain discoverable and the active section is clear.
- Keyboard and touch navigation remain usable.
- Desktop composition is unchanged.

## Notes for AI
Use the attached phone screenshot. Check long labels and both theme families. This is a follow-up refinement to the completed mobile Settings composition work.

## Screenshots

![Settings at 390×844: two stacked navigation layers dominate first view](/api/tasks/1148/attachments/att_a0b17ef0-cf2f-4c7b-8d34-36bcc937fede.png)

## Activity

- 2026-11-17T03:06:33Z · created · t@t
- 2026-11-17T03:06:35Z · screenshots
- 2026-11-17T03:06:37Z · needs_input
- 2026-11-17T03:07:49Z · body: Problem (added); Desired UX (added); Acceptance criteria (added); Notes for AI (added)
- 2026-11-17T03:46:34Z · needs_input
- 2026-11-17T03:46:38Z · status inbox→ready
- 2026-11-17T03:46:41Z · status ready→active, branch
- 2026-11-17T04:02:53Z · body
