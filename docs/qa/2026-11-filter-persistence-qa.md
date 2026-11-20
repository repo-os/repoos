# Work board filter persistence QA — 2026-11 (#1257)

## Scope and setup

QA covered the Work board's search, quick filters and sort across reloads,
project switches and clear-all, at 375, 768 and 1280 px.

- Phone widths (below 720 px) render the **queue** (`MobileWorkQueue`), which
  owns search, priority, area, story, "Assigned to you", and the Show/Reset
  controls. Its state lives in the URL (`q`, `priority`, `area`, `story`,
  `mine`, `sort`, `status`), so a reload restores it.
- Widths of 720 px and up render the **desktop board**. Before this pass it
  ignored those URL filters silently. It now applies them and shows them in a
  chip bar with a clear control (`BoardQueueFilters`). #1259 adds a search
  box above that bar (`BoardQueueSearch`) that writes `q` to the same URL key.

Every check runs against fixtures in
`src/ui-app/tests/work-filter-persistence-qa-browser.test.ts`:

- The real `WorkView`, `MobileWorkQueue` and `BoardQueueFilters` are mounted in
  jsdom against Pinia stores and a stubbed router. The desktop board column is
  stubbed to list the task ids it receives.
- The chip bar is rendered in headless Playwright WebKit with the built global
  stylesheet and the component's compiled scoped CSS.
- No browser window is opened, no live server is used, and no real data is read.
  The three widths are viewport emulations, not real devices.

Run it with:

```bash
bun run build:ui
bunx vitest run --config src/ui-app/vite.config.ts work-filter-persistence work-queue-filters
```

Set `QA_SHOTS=<dir>` to save full-page screenshots to a scratch directory.

Shared logic lives in `src/ui-app/src/lib/workQueueFilters.ts` and is covered
by `src/ui-app/tests/work-queue-filters.test.ts`.

## Results

| Check | 375 px | 768 px | 1280 px |
| --- | --- | --- | --- |
| Reload restores the search from the URL (queue) | pass | n/a | n/a |
| Reload keeps the same filters and visible tasks (board) | n/a | not run¹ | pass |
| Chip bar shows each set filter (board) | n/a | not run¹ | pass |
| Chip bar: every chip and Clear filters inside the viewport, long values | pass | pass | pass |
| Chip bar: short set of chips, Clear filters visible | pass | pass | pass |
| Clear-all removes only queue keys; drawer (`task`, `tab`) and `status` kept (board) | n/a | not run¹ | pass |
| Reset clears every queue key, including `sort` and `status` (queue) | pass | n/a | n/a |
| Reset is disabled with no filters (queue) | pass | n/a | n/a |
| Project switch lands unfiltered (no carried query) | n/a | not run¹ | pass |

¹ The desktop jsdom cases stub the viewport at 1280 px, so they cover the board at that width only. The 768 px board layout is covered by the WebKit chip-bar rows.

Totals in this run: 19 browser-suite cases and 6 pure-logic cases, all passing.
No case was skipped.

## Defects found and fixed

1. **Board ignored the queue filters.** A phone search or priority filter, or a
   shared `/work?q=…` link, carried to 720 px and up was silently dropped. The
   board showed every task with no sign that it was filtered. Fixed: the board
   applies the same predicate as the queue (`matchesWorkQueueFilters`) and shows
   the active filters in a chip bar.
2. **No clear control on the board.** Once the filters were applied on the
   board, nothing could clear them there. Fixed: "Clear filters" removes only
   the five queue keys. It keeps `status`, the drawer params (`task`, `tab`)
   and the other keys.
3. **Duplicated filter logic.** The queue had its own copy of the predicate.
   Moved it into `lib/workQueueFilters.ts`, so the queue and the board cannot
   drift apart. The queue's behavior is unchanged, and its existing tests pass.

## Behavior on the board, pipeline and unusable values

- **Pipeline** does not filter. The chip bar still appears above it, with a
  note that the view doesn't apply these filters, so a filtered link never
  looks like a full list.
- **Unusable URL values** (`priority` other than p0-p3, `mine` other than `1`)
  are not applied. Each one shows a dashed "Ignored" chip, and Clear filters
  removes it. Mobile-only values in the phone queue are unchanged.
- **Clear filters** removes only the five queue keys. Every other query entry
  is kept as it was, including bare `?key` (null) values and repeated values.

## Gaps not fixed (follow-up tasks filed)

- **Sort and the human/held toggles are global, not per project.** They persist
  under the single localStorage keys `repoos.board.sortOrder`,
  `repoos.work.humanVisible` and `repoos.work.heldVisible`. Each project is
  served from its own origin, so storage is already separated per project in
  practice. A same-origin project switch would share these keys. Namespacing
  them by `health.projectName` needs a read after health loads. Not changed.
- **Quick-filter controls on the board.** The board's search box (#1259)
  writes `q` only. `priority`, `area`, `story` and `mine` are still set from
  the phone queue or a link, and the board shows them as chips.
- **Mobile-only status values and the queue sort on the board.** Filed as
  #1260. Until then, `?status=attention|held|archived|human|all` shows every
  task with no chip, and `sort=oldest` is not applied on the board.

## Not covered by a test

- **Reload race.** A pending `router.replace` could overwrite a keystroke in the
  phone search when the URL write lands late. The reasoning is that a later
  replace supersedes the earlier one, so the input settles on the latest value.
  jsdom did not reproduce it, and no test covers it.

## What a human still has to check

- Real-device touch behavior of the chip bar and Clear filters. WebKit viewport
  emulation does not cover touch targets or the native shell.
