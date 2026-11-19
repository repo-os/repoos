# Stats, Dev and activity-log pages QA — 2026-11 (#1234)

## Scope and method

Headless WebKit only, against fixtures — no visible browser, no focus stealing.
The real components are mounted in jsdom with long-row / long-line fixtures;
their markup plus the real built global stylesheet and the compiled scoped
styles render in WebKit at 375, 768 and 1280 px, and every visible element must
stay inside the viewport while the page itself never widens. Screenshots for
every fixture and width can be regenerated with
`QA_SHOTS=<dir> bun run test -- stats-dev-activity-qa-browser`.

Surfaces:

- **Stats (Mission Control)** — `SystemResourcePanel` (sparkline charts, the
  process table, top processes, serve/orphan chips, the pressure banner and the
  worktree-cleanup preview) and `UsagePanel` (usage tables, recent failures).
- **Dev** — `DevView` with a running server target (long name, command, URL and
  log), a companion service, an artifact target and a failed target with a
  long port-holder row and an expanded log.
- **Activity log** — `FeedPanel` (live activity with pasted error lines,
  including a 200-character unbreakable token) and `RepoHistoryPanel`
  (Context → History: commit subjects, deep file paths, expanded detail).

## Findings and fixes

1. **Top-process PIDs disappeared exactly when they mattered.** In
   `SystemResourcePanel` the PID was nested inside the ellipsized command
   name of a Top-processes row, so with a long command line (a Bun invocation
   with a full worktree path) the `#pid` was clipped away entirely — and it
   reported off-viewport geometry at every width. The row is now a four-column
   grid (`owner · command · #pid · value`); the PID gets its own never-truncated
   column. Test asserts the ellipsis and that the long command's `#pid` stays
   on the page.
2. **Usage failure reasons unreadable just below the 860 px breakpoint.** The
   recent-failures grid used fixed columns totalling ~590 px, stacked only at
   ≤720 px — so at 768 px (a 60 px icon rail leaves ~650 px) the reason cell
   was squeezed to a few pixels and the row read as blank. The stack
   breakpoint now matches the breakdown tables' 860 px, and the test requires
   the reason cell to be at least 120 px wide at every width while the full
   reason stays on the element's `title`.
3. **Long unbroken tokens pushed the activity feed off-page between 720 px
   and desktop.** `overflow-wrap: anywhere` on `.feed-msg` was mobile-only
   (≤719.98 px). It is now the base rule: a pasted error line — a session
   token, a checksum — wraps inside the feed at every width instead of
   widening the dashboard page.
4. **Commit-history subjects and file paths painted over the ±counts column.**
   A long unbroken subject (a pasted URL) and a deep path with one very long
   segment overflowed their boxes inside the history row at 375 px.
   `.hist-subject` and `.hist-file-path` now wrap with `overflow-wrap: anywhere`.

## Verified clean (no change needed)

- **Dev page:** long target names, long commands (`.dev-command` already wraps
  with `overflow-wrap: anywhere`), long URLs, artifact paths, holder commands,
  per-service rows and expanded log bodies all stay inside the card at every
  width; the Start / Restart / Stop buttons keep a clickable, on-page
  bounding box at 375 px; log bodies wrap long lines and scroll vertically in
  their own six-line box (#0814).
- **Process table:** keeps its 560 px minimum row inside its own horizontal
  scroller at 375/768 px — the page never widens (the #1205 fix holds).
- **Usage tables:** `nowrap` cells wider than a phone's panel scroll inside
  `.usage-table-wrap` (exercised at 375 px with a 38-character role name).
- **Charts:** both sparklines render with a real two-point history and a
  visible ≥40 px box at every width; the pressure banner, serve/orphan chips
  and GC preview all wrap long content inside the panel.

## Regression coverage

`src/ui-app/tests/stats-dev-activity-qa-browser.test.ts` — 15 WebKit tests
(5 fixtures × 375/768/1280). Verification run:
`bun run test -- stats-dev-activity-qa-browser` passed, and
`REPOOS_CHECK_CHANGED=main repoos check` passed (build, typecheck, scoped
tests, UI smoke).
