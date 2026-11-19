---
id: "1213"
title: "QA: automated multi-screen-size layout check for main pages"
type: chore
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-automated-multi-screen-size-layout-ch
created_at: "2026-11-19T02:18:15Z"
updated_at: "2026-11-19T02:23:58Z"
---
## Problem
No automated check catches layout breaks at phone, tablet and desktop widths; manual QA passes found many.
## Desired UX
A headless Playwright test renders the main pages at 375, 768 and 1280 px and fails on horizontal page scroll, clipped primary buttons or overlapping fixed bars.
## Acceptance criteria
- Headless Playwright only; never open a visible browser or steal focus.
- Cover Work, Agents, Settings, Checks, Releases and the task drawer using existing state fixtures.
- Wire into the UI smoke step so it skips cleanly if Playwright is missing; document in docs/ and user-docs if relevant.
- Fix any real layout bugs it finds, with tests.
## Notes for AI
Do not touch repoos.toml. Keep the test fast (<60s).

## Activity

- 2026-11-19T02:18:15Z · created · t@t
- 2026-11-19T02:18:37Z · status inbox→ready
- 2026-11-19T02:18:44Z · status ready→active, branch
- 2026-11-19T02:23:58Z · message_queued at 2026-11-19T02:23:58.655Z
