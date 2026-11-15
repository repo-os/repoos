---
id: "1137"
title: "Mobile web task detail: one full touch detail for every entry point (card view is a read-only stub; drawer tabs and close clipped)"
type: bug
status: active
paths: [src/ui-app/src/components/MobileTaskDetail.vue, src/ui-app/src/App.vue, src/ui-app/src/components/TaskDrawer.vue]
priority: p1
area: web
story: RepoOS Hub for Mobile
assigned_to: ai
created_by: t@t
branch: feat/mobile-web-task-detail-one-full-touch-de
created_at: "2026-11-15T17:24:03Z"
updated_at: "2026-11-15T20:24:17Z"
---
## Problem
On a phone (below 720px), a task has two different detail views:

1. **Tapping a card in the mobile Work queue** opens `MobileTaskDetail` at `/work?task=<id>`. It has Back, one status button, a metadata grid and the description. It has no Changes, Activity, Review, PM chat, Dev or screenshot tabs and no edit fields (status, priority, area, story). It also lacks Hold / Release hold, Review again, Acknowledge and Archive. App.vue hides TaskDrawer while it's shown.
2. **Opening the same task from Search, a notice or after New task** opens the full desktop TaskDrawer at full width, which has all of the above.

Concrete failures seen at 390x844 on main `23dc737`:

- **Review states disagree.** For #1128 (review), the card view says "Review verdict: no review report yet" with Move to done disabled. The drawer for the same task shows "Review failed: the reviewer crashed or timed out… Review again (clears this) / Dismiss", so from the queue there's no way to act (B1 vs B2).
- **Pause has no visible effect.** After Pause work succeeds (POST /pause returns ok), the card view still shows the "Active" badge and the "Pause work" button. There's no paused state and no Resume (B3).
- **Tab deep links are ignored.** `/work?task=1128&tab=changes` opens the stub with no tabs.
- **The drawer tab row overflows on a phone.** It's 643px wide inside a 390px viewport, with `overflow-x: visible` and no scrolling, so Tokens, Debug and the expand button are off-screen and can't be reached (B5).
- **The drawer close button is undersized and can be clipped.** It's 30x30 with no `aria-label`. With long header chips (for example "! Not fleshed out" + p2), its right edge is at 400.7px in a 390px viewport.
- **The drawer's chat inputs cause iOS zoom.** The PM and reviewer textareas are 12.5px, so iOS Safari zooms in on focus.

## Desired UX
On a phone there's a single task detail, whichever way it was opened (card, search, notice, deep link, after create). It's touch-first and full-screen, with:

- Back to the queue.
- A status line that reflects paused, held, needs input, review failed and similar states.
- The primary action for the current state, including Review again, Resume, Release hold and Acknowledge.
- Swipeable or scrollable tabs: Task, PM, Review, Changes, Activity, plus screenshots.
- Editable metadata.

`?tab=` deep links select the tab. Every control is at least 44px, and inputs are at least 16px.

## Acceptance criteria
- At 360, 390 and 412px, opening a task from a queue card, from Search, from the notices bell and from `/work?task=<id>&tab=changes` all render the same component and land on the same tab.
- For a review task whose reviewer failed, the phone detail shows that state and offers Review again.
- After Pause work, the phone detail shows a paused state and a Resume / Restart action, without a reload.
- Every drawer tab can be reached by touch at 360px (horizontal scroll or overflow menu). `document.scrollWidth === innerWidth`.
- The close / back control is fully on-screen at 360px with the longest header chips, is at least 44x44, and has an accessible name.
- Text inputs and textareas in the phone detail are at least 16px.
- Desktop (≥720px) drawer behavior is unchanged.
- UI tests cover card→detail, search→detail and deep link→tab at a phone viewport.

## Notes for AI
- Files: src/ui-app/src/components/MobileTaskDetail.vue, src/ui-app/src/App.vue (`isMobileTaskDetail` hides TaskDrawer), src/ui-app/src/components/TaskDrawer.vue (tab row, header, close button), src/ui-app/src/views/WorkView.vue.
- You choose the approach: extend MobileTaskDetail, or make TaskDrawer's phone mode the single detail. Avoid keeping two diverging implementations.
- Related but separate: #0303 is the native Hub's touch-first queue and detail (Capacitor shell, depends on #0302). This task is the web UI served by `repoos serve`, which the Hub and phone browsers load. Share components where it makes sense.
- Found in a box-side Playwright QA pass on 16 Nov. Screenshots attached.

## Shots
```json
[
{
"label": "Phone Work detail: one drawer, Review failed state and every tab reachable",
"target": "default",
"route": "/work?task=9999&tab=review",
"highlight": ".drawer-tabs",
"state": "drawer:statusReviewFailedNarrow",
"viewportWidth": 390,
"viewportHeight": 844
},
{
"label": "Phone ?task=&tab=changes deep link lands on the Changes tab at 360px",
"target": "default",
"route": "/work?task=9999&tab=changes",
"highlight": ".drawer-tabs",
"state": "drawer:statusReviewFailedNarrow",
"viewportWidth": 360,
"viewportHeight": 800
}
]
```

## Screenshots

![Card tap on #1128 (review): stub says no review report yet, Move to done disabled, no tabs](/api/tasks/1137/attachments/att_3fa0c23d-e275-46aa-b4ba-02e80b003111.png)
![Same task via Search opens the full drawer: Review failed + Review again](/api/tasks/1137/attachments/att_e1c5435e-ea2c-405d-9957-094fd319ed7f.png)
![After Pause work succeeds the stub still shows Active + Pause work](/api/tasks/1137/attachments/att_057a82db-3aab-422d-8f98-eb6a62abbfcf.png)
![Drawer at 390px: tab row cut off after Changes; Tokens/Debug unreachable](/api/tasks/1137/attachments/att_ab7be06e-0fa2-4aad-9e52-4ec31b268e70.png)

## Activity

- 2026-11-15T17:24:03Z · created · t@t
- 2026-11-15T17:24:03Z · screenshots
- 2026-11-15T19:49:12Z · status inbox→ready
- 2026-11-15T19:49:13Z · status ready→active, branch
- 2026-11-15T20:09:56Z · body
- 2026-11-15T20:13:59Z · CTO nudge: held — handoff gate is running
- 2026-11-15T20:21:03Z · handoff failed · remote validation failed: test failure: tests/agent-serve-guard.test.ts > CLI rejection (real process) > rejects an agent's direct repoos serve and leaves the port free on bee — fix it in the feature branch and re-run the gate
- 2026-11-15T20:21:03Z · message_queued at 2026-11-15T20:21:03.530Z
- 2026-11-15T20:23:59Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-15T20:24:16Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-15T20:24:17Z · message_delivered: 1 message(s)
