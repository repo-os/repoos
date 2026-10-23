---
id: "0942"
title: Style the local checks slots section
type: bug
status: review
priority: p2
area: ui
assigned_to: ai
created_by: hello@repoos.org
branch: feat/style-the-local-checks-slots-section
created_at: "2026-10-23T18:12:35Z"
updated_at: "2026-10-23T19:31:53Z"
---
## Problem

The “local checks slots” content does not have styling that fits with the other content on its page, making the section feel less polished and harder to distinguish.

## Desired UX

Present “local checks slots” in its own card or section, styled consistently with the other sections on the page.

## Acceptance criteria

- [ ] The “local checks slots” content is visually grouped in its own card or section.
- [ ] The styling looks more polished and fits with the existing sections on the page.
- [ ] The content and behavior of the local checks slots remain unchanged.

## Notes for AI

- Find the page containing “local checks slots” and follow its existing styling patterns.
- Assume the section should visually match the other cards or sections on that page; do not redesign unrelated content.

## Original prompt

Fix the styling of the "local checks slots" content, it should probably be it's own card/section like the other stuff on that page. Make it prettier.

## Shots
```json
[
{
"label": "Checks page local slots card",
"target": "default",
"route": "/checks?tab=now",
"highlight": ".ck-local-slots"
}
]
```

## Screenshots

![Screenshot-2026-10-24-at-01.23.36](/api/tasks/0942/attachments/att_c76ded8b-07ff-4288-bdc3-cb8beeb3f775.png)

## Activity

- 2026-10-23T18:12:35Z · created · hello@repoos.org
- 2026-10-23T18:13:00Z · screenshots
- 2026-10-23T18:13:26Z · status draft→inbox, title, area, type, body: Problem (added); Desired UX (added); Acceptance criteria (added); Notes for AI (added)
- 2026-10-23T19:13:17Z · status inbox→ready
- 2026-10-23T19:16:51Z · status ready→active, branch
- 2026-10-23T19:17:33Z · body
- 2026-10-23T19:19:38Z · body
- 2026-10-23T19:31:53Z · note: ui verification passed: 1 of 1 shot captured with clean console
- 2026-10-23T19:31:53Z · status active→review
