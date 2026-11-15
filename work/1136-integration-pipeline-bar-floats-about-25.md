---
id: "1136"
title: "Integration pipeline bar floats about 250px above the bottom over Work content (phone and desktop, regression on main)"
type: bug
status: active
paths: [src/ui-app/src/views/WorkView.vue, src/ui-app/src/style.css, src/ui-app/src/components/IntegrationStatusBar.vue]
priority: p1
area: web
story: RepoOS Hub for Mobile
assigned_to: ai
created_by: t@t
branch: feat/integration-pipeline-bar-floats-about-25
created_at: "2026-11-15T17:23:26Z"
updated_at: "2026-11-15T19:49:07Z"
---
## Problem
On current main (`23dc737`, which includes #1130), the collapsed "Integration pipeline idle" bar on `/work` no longer sits just above the bottom nav. It floats about 250px higher, over the task cards. This happens at every width:

- 390x844: the strip is at y≈520–552 with the bottom nav at 780.
- 1280x800: the strip is at y≈534–568 in the middle of the board. On v0.5.87 it sits at the bottom.
- Expanded on a phone, it covers about 340px of cards.
- At 768px it covers the Active card's "Restart work" action.

It also shows up mid-screen in empty space when the list is short (screenshot A0). This is the "pipeline bar floats over the content" symptom from #1130, and it's still there on main.

Measured with Playwright and CDP: `.ibar-wrap` (position: fixed; bottom: 74px) gets `padding-bottom: 218px`, which comes from the generic `.main > :not(.spin):not(.page-scroll):not(.work-page)…{ padding-bottom: var(--page-bottom-inset) }` rule. WorkView renders `<IntegrationStatusBar class="ibar-outer" />` as a direct child of `.main`. Non-binding hypothesis: #1130 turned WorkView into a multi-root template, which exposed the bar to that selector. Please verify this rather than take it as given.

## Desired UX
- The collapsed bar hugs the bottom: just above the bottom nav on phones, and 14px from the bottom on desktop, the same as v0.5.87.
- It never covers a card's primary action.
- Expanded, it opens upward from that position.
- The content's bottom padding leaves room for it, so the last card can scroll fully clear of the bar and the nav.

## Acceptance criteria
- At 360x740, 390x844, 412x915, 768x1024 and 1280x800, the collapsed strip's bottom edge is within 16px of the bottom nav's top (phone) or the viewport bottom (≥720px).
- The fixed bar wrapper adds no layout padding. The wrapper's height equals the strip's height (or `pointer-events: none` padding is gone).
- At 390x844, `/work?status=review` with one task doesn't show the bar floating mid-screen.
- The 1280px desktop Work board matches v0.5.87 apart from intended changes.
- A UI test asserts the bar's position at a phone width and at 1280.

## Notes for AI
- Files: src/ui-app/src/views/WorkView.vue (`<IntegrationStatusBar class="ibar-outer" />` near line 632), src/ui-app/src/style.css (the `.main > :not(...)` page-bottom-inset rule), src/ui-app/src/components/IntegrationStatusBar.vue (the `@media (max-width: 719.98px)` and `(min-width: 720px)` blocks).
- Prefer fixing it structurally, by excluding fixed-position children from the padding rule or rendering the bar outside `.main` / inside a single WorkView root. Don't add a magic negative offset.
- Found in a box-side Playwright QA pass on 16 Nov (Chromium mobile emulation). Screenshots attached.
- Don't regress #1130's single-layout guarantee.

## Screenshots

![390x844, Review filter with 1 task: collapsed pipeline bar floats mid-screen](/api/tasks/1136/attachments/att_591c500f-a1be-4fea-8ada-3bb7ad5dae75.png)
![1280x800 on main: bar sits mid-board instead of at the bottom (v0.5.87 has it at the bottom)](/api/tasks/1136/attachments/att_88112ec4-d146-4c54-98eb-c3a27addc85e.png)
![768x1024: bar covers an Active card action; header wraps and toolbar clips](/api/tasks/1136/attachments/att_485c8b9b-9822-4177-befe-1eb2fb4c9c0f.png)

## Activity

- 2026-11-15T17:23:26Z · created · t@t
- 2026-11-15T17:23:27Z · screenshots
- 2026-11-15T19:49:05Z · status inbox→ready
- 2026-11-15T19:49:07Z · status ready→active, branch
