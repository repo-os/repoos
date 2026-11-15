---
id: "1138"
title: "Mobile web Work queue: default to what needs attention, add inline search and filters, show held and human tasks"
type: feature
status: done
paths: [src/ui-app/src/components/MobileWorkQueue.vue]
priority: p1
area: web
story: RepoOS Hub for Mobile
merged_commit: 904312a502c3bf39e813a6c95d1873408f643db2
assigned_to: ai
created_by: t@t
branch: feat/mobile-web-work-queue-default-to-what-ne
created_at: "2026-11-15T17:24:06Z"
updated_at: "2026-11-15T21:27:53Z"
last_close_out_gate_ms: 665882
last_close_out_gate_at: "2026-11-15T21:27:33.417Z"
review_passes: 1
---
## Problem
Nick: on a phone it's "really hard to find the right task and do anything normal". On main `23dc737`, the mobile Work queue (MobileWorkQueue.vue):

- **Defaults to everything.** "All statuses", newest first. On the repoos board that's 1,065 cards, of which 1,035 are done. The one review task, the active task and the ready and inbox tasks are mixed in with done ones (C1).
- **Has no search field in the queue.** The only search is the global palette behind the bottom Search tab.
- **Can't filter by anything but status.** There's no priority, area, story, assignee or needs-input filter, and no grouping by status.
- **Hides tasks that need you.** Held and archived tasks are always filtered out (`!task.isArchived && !task.isHeld`), with no way to reach them. For example, #0907 is a human task listed under "Tasks needing you" in the bell, but it doesn't appear in the queue under any filter (C2). The desktop board has Human / Archived / Held lists for this.
- **Doesn't sync the filter with the URL.** It ignores `?status=review`, which desktop honors, and doesn't write the filter to the URL, so it can't be linked or kept across reloads.
- **Renders every card at once.** About 10,900 DOM nodes and a 154,000px scroll height. Toggling sort took about 1.8s with 4x CPU throttling in Chromium mobile emulation.

## Desired UX
- **A default "Needs attention" view grouped by section:** Needs you (human, needs input, held), Review, Active, Ready, Inbox. Done is collapsed or behind its own filter. Section counts match their rows.
- **An inline search box** at the top of the queue that filters by id, title and area.
- **Quick filter chips** for priority, area, story and "assigned to me", plus a way to see Held, Archived and Human tasks.
- **Filter and search state in the URL** (`?status=`, `?q=`), so Back and reload keep them.
- **Smooth scrolling** with a large board, through windowing/virtualization or paginated sections.

## Acceptance criteria
- At 360, 390 and 412px, `/work` opens to a view where review, active, needs-input and human tasks appear before any done task without scrolling past done tasks. Done tasks are hidden or collapsed by default.
- Typing in the queue search narrows the list, and the header count matches the visible cards.
- Held and human tasks (for example a held human task like #0907) can be reached from the queue in two taps or fewer.
- `/work?status=review` opens the queue filtered to Review, and changing the filter updates the URL.
- With about 1,000 tasks, the queue renders at most about 100 task cards at once (or equivalent windowing), and sort/filter changes complete in under 300ms on a mid-range phone profile.
- The empty, loading and error states still work, and the existing MobileWorkQueue tests are updated.

## Notes for AI
- File: src/ui-app/src/components/MobileWorkQueue.vue. Reuse the board's existing held/archived/human selectors and the global search matching where possible.
- #0303 (native Hub touch-first queue) covers the Capacitor shell and depends on #0302. This task is the web UI's mobile queue that phones and the Hub WebView load today. Keep components shareable.
- Found in a box-side Playwright QA pass on 16 Nov. Screenshots attached.

## Shots
```json
[
{
"label": "Mobile Work queue opens on Needs attention, with inline search and quick filters",
"target": "default",
"route": "/work",
"highlight": ".mobile-queue-controls",
"viewportWidth": 390,
"viewportHeight": 844
},
{
"label": "URL ?status=review opens the Review section",
"target": "default",
"route": "/work?status=review",
"highlight": "[data-section=\"review\"] .mobile-task-card",
"state": "board:withReviewTask",
"viewportWidth": 390,
"viewportHeight": 844
}
]
```

## Verification
- Scoped `repoos check --changed main` passes (format, lint, build, CSS/theme/color guards, UI smoke, rendered contrast).
- `src/ui-app/tests/mobile-work-queue.test.ts` covers the grouped default view, search by id/title/area, priority/area/story/human chips, held/human reachability, `?status=` read and URL write-back, the 1,000-task card cap, and the empty/loading/error states.
- The card bound is enforced and tested. The separate 300ms mid-range-phone timing target was not measured in this session; verify it in a CPU-throttled mobile browser profile.

## Screenshots

![360px: queue defaults to All statuses, 1065 tasks incl. 1035 done, no search](/api/tasks/1138/attachments/att_b78506c3-5dbe-4c4d-8f17-de54c90d274d.png)
![Bell lists tasks needing you (e.g. held human #0907) that never appear in the mobile queue](/api/tasks/1138/attachments/att_83638a4b-6f22-4314-968a-7bc374399ebc.png)

## Activity

- 2026-11-15T17:24:06Z · created · t@t
- 2026-11-15T17:24:06Z · screenshots
- 2026-11-15T19:49:18Z · status inbox→ready
- 2026-11-15T19:49:20Z · status ready→active, branch
- 2026-11-15T19:58:16Z · body
- 2026-11-15T20:00:08Z · body
- 2026-11-15T20:02:09Z · body
- 2026-11-15T20:05:50Z · body
- 2026-11-15T20:07:24Z · body: Verification (added)
- 2026-11-15T20:07:24Z · message_queued at 2026-11-15T20:07:24.248Z
- 2026-11-15T20:07:37Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-15T20:07:37Z · message_queued at 2026-11-15T20:07:37.358Z
- 2026-11-15T20:07:37Z · ↻ resuming engineer to read queued message
- 2026-11-15T20:07:37Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: Now I'll rewrite `MobileWorkQueue.vue` with URL-backed filters, sections, search, chips, and pagination. · stderr: (empty)
- 2026-11-15T20:07:37Z · message_delivered: 2 message(s)
- 2026-11-15T20:08:59Z · CTO nudge: held — handoff gate is running
- 2026-11-15T20:10:29Z · note: ui verification passed: 3 of 3 shots captured with clean console
- 2026-11-15T20:10:30Z · message_queued at 2026-11-15T20:10:30.132Z
- 2026-11-15T20:10:44Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-15T20:13:31Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-15T20:13:32Z · message_delivered: 1 message(s)
- 2026-11-15T20:15:33Z · body
- 2026-11-15T20:17:56Z · body
- 2026-11-15T20:18:59Z · CTO nudge: held — handoff gate is running
- 2026-11-15T20:20:13Z · note: ui verification passed: 2 of 2 shots captured with clean console
- 2026-11-15T20:20:13Z · status active→review
- 2026-11-15T20:20:14Z · message_queued at 2026-11-15T20:20:14.117Z
- 2026-11-15T20:21:07Z · note: review pass 1: good to go
- 2026-11-15T21:27:33Z · close-out gate completed in 666s
- 2026-11-15T21:27:49Z · status done→done, release:success
- 2026-11-15T21:27:53Z · message_dropped: 1 queued message(s) discarded — task is done
