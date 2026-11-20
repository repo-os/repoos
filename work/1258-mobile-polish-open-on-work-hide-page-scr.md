---
id: "1258"
title: "Mobile polish: open on Work, hide page scrollbar, even-height header row"
type: bug
status: active
priority: p2
area: [web, mobile]
assigned_to: ai
created_by: t@t
branch: feat/mobile-polish-open-on-work-hide-page-scr
cli_override: claude code
model_override: haiku
created_at: "2026-11-20T00:15:33Z"
updated_at: "2026-11-20T00:36:54Z"
---
## Problem
On a phone (seen on the Android Hub app, Mission Control page):
1. The app opens on Mission Control (the Control page). The first page should be Work.
2. A visible scrollbar sits on the right edge of the page, which wastes space and leaves the left and right gutters uneven. On mobile it is obvious the page scrolls.
3. The top-left project (repo name) chip is taller than the round icon buttons beside it and its text looks too light and small, so the header row looks uneven.
## Desired UX
- Opening the app (the root route, and the app launch on phone and desktop) lands on Work by default. Settings is an acceptable alternative only if Work is not feasible; default to Work. Deep links and a remembered last page, if any exist today, keep working.
- On phone widths the page scrollbar is hidden (the page still scrolls by touch) and the reclaimed space makes the left and right gutters equal. Desktop scrollbars stay as they are.
- Every control in the top header row (project chip, search, notifications, theme, help, account) is the same height and vertically centred. The project chip text is bolder and/or a little bigger so it reads clearly; its shape and radius match the neighbouring buttons.
## Acceptance criteria
- Default route is Work; a test covers opening / and the app start route. Check that nothing else (docs, links, redirects, Hub shell start URL) still assumes Control is the home page, and update docs that say so.
- Mobile page scrollbar hidden without breaking touch scrolling or keyboard scrolling; no horizontal page scroll; gutters equal at 375 and 412 px. Use theme tokens, not hard-coded colors.
- Header row controls share one height token; add a layout test (computed heights equal at 375, 412, 768 and 1280 px) and check light and dark themes.
- Headless Playwright only; never open a visible browser or steal focus.
- Commit a short docs/qa note listing what was checked.
## Notes for AI
Screenshot attached shows the current mobile header and Mission Control. Do not touch repoos.toml. Follow AGENTS.md conventions (full-width pages, no native title tooltips). This is a small UI fix; keep it to these three items.

## Shots
```json
[
{
"label": "Work is the home page; header row controls share one height",
"target": "default",
"route": "/work",
"highlight": ".topbar"
}
]
```

## Screenshots

![Mobile Mission Control: scrollbar on the right, tall repo chip](/api/tasks/1258/attachments/att_ec508aac-926b-4ad8-8020-060dbcfc4ca0.png)

## Activity

- 2026-11-20T00:15:33Z · created · t@t
- 2026-11-20T00:15:36Z · screenshots
- 2026-11-20T00:15:56Z · status inbox→ready
- 2026-11-20T00:16:00Z · cli_override, model_override
- 2026-11-20T00:16:03Z · status ready→active, branch
- 2026-11-20T00:17:11Z · note: adopted orphaned engineer pid 86874
- 2026-11-20T00:33:31Z · body
- 2026-11-20T00:36:54Z · note: ui verification passed: 1 of 1 shot captured with clean console
