---
updated_at: "2026-09-18T11:50:05Z"
review_passes: 2
id: "0409"
title: Fix horizontal overflow on landing and docs pages for mobile
type: bug
status: review
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/fix-horizontal-overflow-on-landing-and-d
created_at: "2026-09-18T11:21:42Z"
last_check_failure: "[object Object]"
review_rounds: 1
---
## Problem

The landing page and docs page overflow horizontally on mobile devices. The main culprit appears to be code sections (pre/code blocks) that are wider than the viewport, causing the entire page to scroll horizontally rather than just the code block itself. This breaks the mobile reading experience and makes both pages look broken on small screens.

## Desired UX

On mobile, the landing page and docs page should never cause horizontal scrolling at the page/body level. Code blocks that are wider than the viewport should scroll horizontally within their own container, leaving the rest of the page layout unaffected. All other content should reflow or wrap normally within the viewport width.

## Acceptance criteria

- [ ] Landing page has no horizontal body/page overflow on mobile viewports (320px–480px wide)
- [ ] Docs page has no horizontal body/page overflow on mobile viewports (320px–480px wide)
- [ ] Code sections on both pages scroll horizontally within their own container when content exceeds the viewport width
- [ ] No other page content (headings, prose, nav) is clipped or causes horizontal overflow
- [ ] A Playwright (or equivalent) test verifies that `document.body.scrollWidth <= window.innerWidth` on both pages at a 375px viewport width
- [ ] The regression test is integrated into `repoos check` (or the existing test suite) so future changes are caught automatically

## Notes for AI

- The fix should use CSS — most likely `overflow-x: auto` (or `scroll`) on `pre`, `code`, or a wrapping element, combined with `max-width: 100%` — rather than JS.
- Also check for any other elements that might expand past the viewport (wide tables, images without `max-width: 100%`, long unbreakable strings).
- Do not change the desktop layout; scope the fix to mobile-only if a media query is needed, but prefer a solution that works at all widths without a breakpoint.
- The existing UI lives under `src/ui-app/`; check `src/ui-app/src/views/` for the landing and docs views, and `src/ui-app/src/style.css` for global styles.
- The test should run headless via Playwright (WebKit and/or Chromium mobile emulation). If Playwright is already used for the smoke test in `repoos check`, extend that suite rather than adding a new harness.
- Assumption: "docs page" refers to the in-app docs/context viewer, not an external documentation site. If there is a separate marketing docs page, apply the same fix there too.
- Do not refactor unrelated styles; keep the diff minimal and focused on overflow containment.

## Scope

Covers the landing page and docs page only. Other pages that may have similar issues are out of scope for this task — file a separate task if found.

## Original prompt

the landing page and docs page are overflowing horizontally on mobile. please fix them and ensure there is some testing in place to make sure it doesn't happen again. mostly it seems to be the code sections which caused overflow, probably the solution is to make sure those sections have a max width of the window and scroll horizontally, not the whole page scrolling horizontally.

## Screenshots

![photo_2026-09-18-11.30.49](/api/tasks/0409/attachments/screenshot-1.jpg)
![photo_2026-09-18-11.30.34](/api/tasks/0409/attachments/screenshot-2.jpg)
![photo_2026-09-18-11.30.39](/api/tasks/0409/attachments/screenshot-3.jpg)
![photo_2026-09-18-11.30.37](/api/tasks/0409/attachments/screenshot-4.jpg)
![photo_2026-09-18-11.30.27](/api/tasks/0409/attachments/screenshot-5.jpg)

## Activity

- 2026-09-18T11:21:42Z · created · hello@repoos.org
- 2026-09-18T11:21:42Z · screenshots
- 2026-09-18T11:21:42Z · screenshots
- 2026-09-18T11:21:42Z · screenshots
- 2026-09-18T11:21:42Z · screenshots
- 2026-09-18T11:21:42Z · screenshots
- 2026-09-18T11:21:59Z · status draft→inbox, title, area, type, body
- 2026-09-18T11:26:42Z · status inbox→ready
- 2026-09-18T11:34:39Z · status ready→active, branch
- 2026-09-18T11:42:03Z · status active→review
- 2026-09-18T11:43:36Z · status review→active
- 2026-09-18T11:47:14Z · status active→review

