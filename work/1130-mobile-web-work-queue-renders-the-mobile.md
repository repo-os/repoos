---
id: "1130"
title: "Mobile web: Work queue renders the mobile list and desktop board on top of each other"
type: bug
status: active
priority: p0
area: web
story: RepoOS Hub for Mobile
assigned_to: ai
created_by: t@t
branch: feat/mobile-web-work-queue-renders-the-mobile
created_at: "2026-11-15T14:34:55Z"
updated_at: "2026-11-15T15:15:46Z"
deferred_handoff_resume_count: 1
---
## Problem
On a phone browser (Nick's Nothing Phone 3a, Chrome, about 412px wide, opening `https://bee.tailc0c173.ts.net:7499` on the tiao project, server v0.5.83), the Work page draws two layouts at once:

- The mobile "Work queue" composition (heading, "New task" button, STATUS filter, Updated/Newest sort, Reset, and a list of task cards).
- The desktop board (the "Work Queue" header, "Repo-native tasks · repoos/work/*.md", "Client board", the collapse button, "Most recently updated", the DRAFT/Inbox/Review/Done columns and their cards).

The desktop board is painted over the lower half of the mobile list, so the mobile cards get cut off partway (for example, the #0084 title is cut off and the board's Review section overlaps it). The filters disagree too. With STATUS=Review, the mobile header says "1 task", but the board below still shows Inbox (17) and Done (99). The "Integration pipeline idle" bar also floats over the content. In practice you can't find a task or do anything normal on a phone.

Three phone screenshots taken at 22:26 SGT on 15 Nov 2026 show this, with STATUS set to Review twice and to All statuses once.

## Desired UX
On a narrow viewport, Work shows exactly one layout: a single readable column with working search, filter and sort. Tapping a card opens its details, and actions like "Move to done" or "Move to ready" can be tapped. Nothing overlaps, there's no horizontal overflow, and the header counts match what's listed.

## Acceptance criteria
- First, reproduce on the current main build (v0.5.87+) at 360, 390 and 412px widths. Record whether main still has the double render or whether only bee's older v0.5.83 does, and fix whatever main still gets wrong.
- Below the mobile breakpoint, the desktop board isn't mounted (or is hidden with display:none). Only one queue renders.
- The status filter, sort and the visible list agree, and the task count matches the list.
- The integration pipeline bar and the bottom nav don't cover content. The content area has bottom padding.
- Task detail opens and the primary actions work by touch, with targets of at least 44px.
- A UI test or screenshot test at a phone viewport catches a regression back to the double render.
- Desktop layout is unchanged at 1280px and wider.

## Reproduction
Reproduced on this branch (based on current main) at 360, 390 and 412 px by mounting WorkView with a narrow matchMedia: before the fix, the DOM contained both the mobile queue ([data-testid=mobile-work-queue]) and the desktop .work-page board at all three widths; after the fix only the mobile queue is present. The pre-fix run is the new parameterized test failing on .work-page. No live v0.5.87 server or real phone was available in this agent run, so the live-build/device reproduction was not observed; the phone screenshots are from v0.5.83. The HEAD source had the same v-else chain, so main is affected too.

## Shots
```json
[
{
"label": "Phone Work queue at 390px: one layout, filter row and list",
"target": "default",
"route": "/work",
"highlight": "[data-testid=\"mobile-work-queue\"]",
"viewportWidth": 390,
"viewportHeight": 844
},
{
"label": "Desktop Work board unchanged at 1280px",
"target": "default",
"route": "/work",
"highlight": ".board",
"viewportWidth": 1280
}
]
```

## Activity

- 2026-11-15T14:34:55Z · created · t@t
- 2026-11-15T14:34:56Z · needs_input
- 2026-11-15T14:35:07Z · status inbox→ready
- 2026-11-15T14:35:12Z · status ready→active, needs_input, branch
- 2026-11-15T15:12:08Z · body
- 2026-11-15T15:14:42Z · body: Reproduction (added)
- 2026-11-15T15:14:43Z · message_queued at 2026-11-15T15:14:43.255Z
- 2026-11-15T15:14:51Z · body
- 2026-11-15T15:15:46Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-15T15:15:46Z · message_queued at 2026-11-15T15:15:46.761Z
