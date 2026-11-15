---
id: "1139"
title: "Mobile web polish: 44px tap targets, no iOS input zoom, touch-only hints, landscape/tablet layout, PWA start page and icon"
type: bug
status: active
priority: p2
area: web
story: RepoOS Hub for Mobile
assigned_to: ai
created_by: t@t
branch: feat/mobile-web-polish-44px-tap-targets-no-io
created_at: "2026-11-15T17:24:09Z"
updated_at: "2026-11-15T21:27:54Z"
dev_error_count: 1
engineer_crash_log: "[{\"cli\":\"opencode\",\"model\":\"opencode-go/deepseek-v4.1-flash\",\"at\":\"2026-11-15T21:27:51.683Z\",\"kind\":\"dev-error\"}]"
---
## Problem
Smaller mobile issues found on main `23dc737` (Chromium mobile emulation; 360/390/412 portrait, 740/844 landscape, 768 tablet):

1. **Top bar tap targets under 44px** at every phone width: bell, theme toggle and help are 30x30, the project chip is 113x31, and the search pill is 60x27. The project chip opens a repo colour picker, which looks like a project switcher.
2. **iOS Safari zooms in on focus:** the New task inputs (freeform textarea 13.5px, Manual title and fields 13px) are under 16px.
3. **Desktop-only hints on a phone:** the search palette footer shows keyboard hints ("↑↓ Navigate · Enter Open · Esc Close"), and the top search pill shows ⌘K.
4. **Landscape phones and 768px tablets get the desktop board with the full sidebar:**
- The "Work Queue" title wraps to 2 or 3 lines.
- The header toolbar is clipped ("Pipeline" cut off).
- The Integration bar overlaps the title (D1).
5. **Agents page:** the sub-tab strip ("Agents / Build Your Team / Scheduled Tasks…") is clipped at 390px, and the header links and buttons are 18 to 39px tall.
6. **PWA:**
- `start_url` is `/`, so the installed app opens Mission Control rather than Work.
- index.html has no `<link rel="apple-touch-icon">`, and `/apple-touch-icon.png` returns the HTML page, so the iOS home-screen icon falls back to a screenshot.
- `orientation: portrait-primary` locks the installed app to portrait.
7. **Failed request on drawer open:** every drawer open for a task without a branch makes `GET /api/tasks/<id>/stats` → 404 and logs a console error (desktop too).

## Desired UX
- Every tappable control on phone layouts is at least 44x44.
- Inputs are at least 16px on touch devices.
- No keyboard-shortcut hints on touch.
- Landscape phones and small tablets get a layout that fits: a collapsible or icon-only sidebar, and a header that wraps cleanly without clipping.
- The installed PWA opens to Work, has a proper iOS icon and can rotate.
- No failed requests in normal navigation.

## Acceptance criteria
- At 360, 390 and 412px, the top bar and Agents page have no visible interactive element under 44px in either dimension (a Playwright check like the QA script's tap-target scan).
- On `(pointer: coarse)`, New task, Manual and search inputs compute to a font-size of at least 16px.
- The search palette and top search pill hide keyboard hints on `(hover: none)`.
- At 740x360, 844x390 and 768x1024, `/work` and `/agents` have no clipped toolbar or tab strip, and the page title fits on at most 2 lines.
- The manifest `start_url` opens Work (or a configurable start page). An apple-touch-icon is served as a PNG and linked from index.html. Orientation is `any` (or documented).
- Opening a task drawer for a branchless task produces no 4xx in the console (return an empty stats payload or skip the call).

## Notes for AI
- Likely files: src/ui-app/src/components/TopBar.vue, the New task panel component, the search palette component, src/ui-app/src/views/AgentsView.vue, src/ui-app/src/composables/useResponsiveLayout.ts (720px breakpoint), src/ui-app/index.html, the server route that builds `manifest.webmanifest`, and the `/api/tasks/:id/stats` handler.
- #1133 is reworking the Agents page last-runs log. Coordinate so this only touches tab and target sizing.
- Found in a box-side Playwright QA pass on 16 Nov. Screenshots attached.

## Screenshots

![740x360 landscape: desktop board + sidebar, title wraps, toolbar clipped, bar over title](/api/tasks/1139/attachments/att_dfb31a2f-0418-4561-85a5-7dfc888c1e5d.png)

## Activity

- 2026-11-15T17:24:09Z · created · t@t
- 2026-11-15T17:24:09Z · screenshots
- 2026-11-15T20:38:21Z · status inbox→ready
- 2026-11-15T20:38:24Z · status ready→active, branch
- 2026-11-15T20:54:48Z · body
- 2026-11-15T21:08:44Z · body
- 2026-11-15T21:27:51Z · note: stopped orphaned engineer pid 20251
- 2026-11-15T21:27:51Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-11-15T21:27:51Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4.1-flash (1/3 crashes in 30m) · the agent process exited with an error — open the task to see the full output. Open Raw CLI error for details. (CLI: the agent process exited with an error — open the task to see the full output)
- 2026-11-15T21:27:54Z · needs_input
