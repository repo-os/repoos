# Checks page run history, logs, and failure detail QA

Date: 2026-11-19

## Coverage

Checked the Checks page in a headless Chromium browser at 1280px and 375px using
the auth-less `just serve-noauth` server from a detached scratch worktree. The
Runs tab used a synthetic failed `GET /api/check-runs?limit=300` response for
task #1202; the Test suite tab used a synthetic completed run response with
180 log lines. These responses exercised the real page components and layout,
without writing test data into the check-run store. No visible browser or user
browser profile was used.

## Findings and change

The run-history table is contained in a horizontal scroller and did not widen
the page at either viewport. At 375px, however, its Outcome column is beyond the
initial viewport because the history includes seven sortable columns. A failed
step such as `rendered-contrast` was therefore hidden until the user scrolled
sideways. The failure label already appeared in Outcome on desktop, and the
expanded detail already listed step timings and failed tests.

The Runs tab now repeats `Failed at <step>` in the Started cell on screens up to
720px. This keeps the key diagnosis in the first visible column while retaining
the sortable table and its existing horizontal scrolling. A component test
asserts that a failed run includes the compact failed-step summary and retains
the detailed Outcome label.

## Browser observations

| Viewport | Page width / scroll width | Runs tab | Test suite log |
| --- | ---: | --- | --- |
| 1280px | 1280 / 1280 | Failure step is in the normal Outcome column; compact label is hidden. | 318px client height, 3007px content, `overflow-y: auto`; log scroll position could be moved to 0. |
| 375px | 375 / 375 | `Failed at rendered-contrast` is visible beneath the timestamp in the first column; no page-level horizontal overflow. | 318px client height, 5993px content, `overflow-y: auto`; log scroll position could be moved to 0. |

The expanded run details also remained inside the table's horizontal scroller.
The Test suite's 180-line synthetic log was initially positioned at the bottom
and could be scrolled back to its start at both widths. No browser page errors
were observed.

## Verification

- `bun run test --run src/ui-app/tests/check-runs-mobile-failure.test.ts` —
  passed (the repository wrapper also ran its boot-timing pass).
- `REPOOS_CHECK_CHANGED=main repoos check` — passed: format, lint, build, CSS
  layers, theme contrast, hard-coded-color guard, rendered contrast, bare-require
  guard, branch artifacts, scoped tests, and UI smoke. The smoke check covered
  Checks tabs at 1440px, 390px, and 320px.

## Limits

The failed run and completed test output were synthetic browser responses. This
checks rendering and scrolling, not a live failing RepoOS check or persistence
of a real run's logs. Run history stores failure summary and step timings; the
Test suite panel exposes the current/last local test-run output.
