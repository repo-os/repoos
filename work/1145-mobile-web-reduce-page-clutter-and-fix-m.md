---
id: "1145"
title: "Mobile web: reduce page clutter and fix More sheet readability"
type: bug
status: inbox
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Desired UX"
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-17T02:52:23Z"
updated_at: "2026-11-17T02:52:25Z"
---
## Problem
Phone screens waste space on repeated explanations, navigation labels, and an idle integration bar. Some page headings are not left aligned. The More sheet is translucent, so underlying text shows through and makes it difficult to read. See all five attached phone screenshots.

## Acceptance criteria
- At phone widths hide nonessential explanatory subtitles below page titles throughout the UI, including Releases and Stories; preserve information needed to use the page and leave desktop behavior intact.
- Hide the REPOOS / WORK breadcrumb above the mobile Work queue title and hide the integration pipeline bar while idle on mobile; show useful active, failed, or attention-required pipeline states.
- Align page titles consistently with the left content edge on narrow screens, including Mission Control; address the cramped and shifted task-detail title shown in the screenshot.
- Make the More bottom sheet background opaque enough for legible content in every supported theme and both light and dark modes, with underlying content not bleeding through.
- Check narrow phone widths, long labels, accessibility and contrast; preserve keyboard and touch interactions and desktop layouts. Add focused regression coverage and rebuild the UI.

## Notes for AI
Treat the screenshots as concrete references. Follow existing shared UI and theme conventions; avoid hiding actionable status. Coordinate scope with the separate mobile design audit.

## Screenshots

![1000072370](/api/tasks/1145/attachments/att_d2716b60-a384-4274-80b2-80a3790cd983.png)
![1000072371](/api/tasks/1145/attachments/att_905adefe-53b9-4946-a28c-7080fc3131f2.png)
![1000072372](/api/tasks/1145/attachments/att_66107e44-954c-4814-a3aa-aa26286677a8.png)
![1000072373](/api/tasks/1145/attachments/att_aa43f1c7-02fd-4049-b130-cbdc1a9aa460.png)
![1000072374](/api/tasks/1145/attachments/att_ecb27267-9de8-4bcb-ad37-aabbbd85f53f.png)

## Activity

- 2026-11-17T02:52:23Z · created · t@t
- 2026-11-17T02:52:24Z · screenshots
- 2026-11-17T02:52:25Z · needs_input
