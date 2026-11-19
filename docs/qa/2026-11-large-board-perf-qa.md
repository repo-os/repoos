# Work board with 1000+ tasks: performance and scroll QA — November 2026

Task #1251. Scope: the Work board and its Done column at 375, 768 and 1280 px, with a generated 1200-task fixture. This pass measured render, filter and scroll cost, fixed four script-work hotspots, and recorded numbers before and after.

## Method

- **Fixture.** `makeLargeBoard(1200)` in `src/ui-app/tests/large-board-fixture.ts` builds a `/api/board` payload in the server's shape: 980 done, 20 review, 20 active, 60 ready, 80 inbox and 40 draft. One task in 25 is human-assigned and one in 40 is held. Titles vary in length. Bodies are the 500-character preview the store uses.
- **Harness.** Headless WebKit only. Playwright routes serve the built UI from `dist/ui` and answer `/api/*` from the fixture in memory. No repository, no `repoos serve`, no visible browser, and no real task data changed.
- **Timing.** Every number is read inside the page with `performance.now()`, measured to the next painted frame (two `requestAnimationFrame` calls) after an input. Open time runs from navigation start to the first painted card.
- **Baseline.** The baseline is `HEAD` for `repo.ts` and `WorkView.vue`, built the same way, with three runs. The fixed build is the working tree, also three runs. Table values are medians. Ranges in brackets are the min and max of the three runs.
- **Reproduce.** `bun run build:ui && bun docs/qa/measure-large-board-perf.mjs 1200`. The regression test is `bun run test -- work-board-large-perf`.

## Results

| Width | Measure | Baseline (median) | Fixed (median) | Ranges, baseline / fixed |
| --- | --- | --- | --- | --- |
| 375 | First card painted | 408 ms | 431 ms | 398–448 / 379–446 |
| 375 | Phone search, input to paint | 33 ms | 33 ms | — |
| 375 | Done list, "Show more" press, slowest of 81 | 70 ms | 54 ms | 66–126 / 53–55 |
| 375 | Done list, frame gap while scrolling | 127 ms | 93 ms | — |
| 375 | Idle, longest frame gap in 4 s | 67 ms | 61 ms | 55–70 / 56–62 |
| 768 | First card painted | 861 ms | 861 ms | 760–892 / 852–949 |
| 768 | Human toggle, input to paint | 102 ms | 90 ms | 101–106 / 82–104 |
| 768 | Held toggle, input to paint | 79 ms | 76 ms | — |
| 768 | Done column expand, input to paint | 89 ms | 111 ms | 88–98 / 93–118 |
| 768 | Done column scroll, frame gap (60 steps) | 135 ms | 123 ms | 98–172 / 115–129 |
| 768 | Idle, longest frame gap in 4 s | 107 ms | 138 ms | 104–115 / 117–167 |
| 1280 | First card painted | 932 ms | 864 ms | 802–975 / 807–908 |
| 1280 | Human toggle, input to paint | 104 ms | 94 ms | 95–111 / 73–110 |
| 1280 | Held toggle, input to paint | 91 ms | 94 ms | — |
| 1280 | Done column expand, input to paint | 149 ms | 161 ms | 120–163 / 159–203 |
| 1280 | Done column scroll, frame gap (60 steps) | 122 ms | 125 ms | 107–193 / 107–143 |
| 1280 | Idle, longest frame gap in 4 s | 113 ms | 99 ms | 106–130 / 96–142 |

Layout checks held on both builds at 768 and 1280 px. A card that stayed mounted across a Done window shift moved 0 px in content space. Scroll steps were never clamped. At most 40 Done cards were mounted at once.

## What changed

1. **Done sort computes each key once.** `sortTasks` in `src/ui-app/src/stores/repo.ts` ran the activity-log regex inside the comparator, so a sort of 980 done tasks scanned bodies O(n log n) times. It now derives each key once. The ordering rules are unchanged and covered by `src/ui-app/tests/board-visibility-perf.test.ts`.
2. **A filter that hides nothing in a column keeps that column's array.** `withoutHiddenTasks` (`src/ui-app/src/lib/boardVisibility.ts`) returns the same array when none of a column's tasks are hidden. Before, every filter change made a new Done array, which re-sorted the 980 cards.
3. **Hidden-id and held-list identity are stable.** The held list re-derives every second while any hold is active. `keepSameIds` and `keepSameList` return the previous `Set` or array when the contents are equal, so the board does not re-render once a second for no change.
4. **Regression test.** `src/ui-app/tests/work-board-large-perf-browser.test.ts` runs the same measurements in WebKit at all three widths. It asserts the structural invariants above and loose timing budgets (first card under 15 s, filter paint under 1.5 s, phone "Show more" under 1.5 s, idle stall under 2 s). It does not assert the medians in the table.

## Findings and what was not fixed

- **The fixes reduce script work, but desktop wall-clock time did not change beyond run-to-run noise.** A Chromium CPU profile of the 4 s idle window showed the board's JavaScript dominated by Vue dependency tracking and WorkView render. Per-run figures from that profile are not comparable across the two builds, so no before-and-after number is claimed for script time. In WebKit, the remaining desktop cost is native layout and paint of about 260 mounted cards. Filter toggles take 75–110 ms to paint and Done expand takes 110–200 ms. Scroll gaps reach 100–190 ms, with 4–6 frames over 50 ms in 60 steps.
- **Done expand may be slightly slower on the fixed build** (median 149 → 161 ms at 1280 px, 89 → 111 ms at 768 px). The ranges overlap at 1280 px but not at 768 px. I did not isolate the cause. Treat it as an open question rather than a regression I have confirmed.
- **CSS containment does not help.** `contain: layout style` on the cards or on the column children made no difference to toggle or scroll time, so I did not ship it.
- **Phone Done list is not windowed.** It pages 12 cards per "Show more", but once the whole list is paged in, all 980 cards stay mounted. The DOM and scroll cost grow with paging. Windowing it, as the desktop Done column does, is the next step if phone scroll is still judged slow on a real device.
- **Idle frames are still long on desktop** (8–10 frames over 50 ms in 4 s at 768 and 1280 px) with only 8–12 DOM mutations. The cost is not in DOM churn. The source has not been isolated.
- **Open time is about 0.4 s at 375 px and 0.8–0.9 s at 768 and 1280 px** to the first painted card, with the UI bundle served from disk.

## Limits

- Headless WebKit on one development machine, with emulated viewports. This is not a real phone. Touch scrolling, momentum and the phone's GPU were not measured. A human with a real device needs to check the 375 px scroll feel.
- The fixture uses short bodies. Real task bodies can be larger, but the store only holds the 500-character preview for board tasks, so the sort cost is bounded by that preview length.
- The runs did not use the live server, real repository data, or the auth flow. Auth was stubbed as off.
- The numbers vary by about ±15% from run to run. Only the phone "Show more" improvement is consistent across the three runs. Treat the other differences as noise.
