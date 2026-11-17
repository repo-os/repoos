---
id: "1145"
title: "Mobile web: reduce page clutter and fix More sheet readability"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/mobile-web-reduce-page-clutter-and-fix-m
created_at: "2026-11-17T02:52:23Z"
updated_at: "2026-11-17T03:18:56Z"
dev_error_count: 1
engineer_crash_log: "[{\"cli\":\"opencode\",\"model\":\"opencode-go/deepseek-v4.1-flash\",\"at\":\"2026-11-17T03:01:13.692Z\",\"kind\":\"dev-error\"}]"
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

## Desired UX
On a phone, page headings and content start at a consistent left edge, essential information appears first, and unnecessary descriptions and idle chrome stay out of the way. The More sheet remains clearly readable in every theme.

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
- 2026-11-17T02:52:33Z · needs_input, body: Desired UX (added)
- 2026-11-17T02:53:31Z · status inbox→ready
- 2026-11-17T02:53:34Z · status ready→active, branch
- 2026-11-17T03:01:13Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-11-17T03:01:13Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4.1-flash (1/3 crashes in 30m) · the agent process exited with an error — open the task to see the full output. Open Raw CLI error for details. (CLI: the agent process exited with an error — open the task to see the full output)
- 2026-11-17T03:01:15Z · needs_input
- 2026-11-17T03:18:56Z · body
