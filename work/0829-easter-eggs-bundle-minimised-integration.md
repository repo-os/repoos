---
id: "0829"
title: "Easter eggs bundle: minimised integration pill tooltip, and why the median says 10 runs"
type: bug
status: inbox
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Problem, Desired UX, Acceptance criteria, Notes for AI"
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-18T06:17:45Z"
updated_at: "2026-10-18T06:18:02Z"
---
## Items

- [ ] **E1 · Minimised pill shows only the median popup, centered** (web) — remove the extra native title tooltip over it. Source: Nick 2026-10-18.
- [ ] **E2 · Median run count: explain "10 runs" and backfill if possible** (web, server) — the agreed window is the last 15 succeeded full close-outs. Source: Nick 2026-10-18.

## E1 · Minimised pill shows only the median popup, centered

### Problem
In the minimised integration bar (e.g. `#0824 integrating… build  T-03:21`), hovering shows two popups: the designed median tooltip (`Median 4m 06s · 10 runs` / "Click to switch between elapsed time and a countdown") and, over it, a second native tooltip "Integration pipeline — #0824 build". The second is redundant and covers the first. It is the native `:title="stripTooltip"` on the strip (`src/ui-app/src/components/IntegrationStatusBar.vue` ~line 477; text built around line 417). AGENTS.md also forbids native `title` tooltips for new UI.

### Desired UX
- In the minimised state, hovering/focusing the timer shows only the median tooltip; no native title tooltip appears over it.
- The median tooltip is horizontally centered on the pill (it currently sits off to one side).
- Keep an accessible name for the strip (aria-label), just no native title popup.

### Acceptance criteria
- Test: the minimised strip has no `title` attribute (accessible name still present).
- Test: hovering the timer opens exactly one tooltip (the median one).
- Test: the median tooltip is centered on the pill's horizontal midpoint (within a few px) in the minimised state.
- Light and dark checked via a declared shot with the `integration:median15` or `closeOut:active` fixture, not a plain board.

### Notes for AI
Do not touch the expanded stage list tooltips unless they share the same native-title bug; if they do, say so in the handoff rather than widening scope. Use real task ids in shots, not 9999.

## E2 · Median run count: explain "10 runs" and backfill if possible

### Problem
The tooltip reads "Median 4m 06s · 10 runs", but #0814/#0819 agreed on the last 15 SUCCEEDED full close-outs (merged to main), not short checks. The UI limit is already 15 (`INTEGRATION_MEDIAN_SAMPLE` in `src/ui-app/src/lib/integration-pipeline-ui.ts`) and the stores keep 50 (`MAX_EVENTS` in `src/server/close-out-outcome.ts`, `CLOSE_OUT_TIMING_LIMIT` in the notices store). The real cause is the data: `.repoos/close-out-outcomes.json` holds 50 events, but only 10 are `succeeded` with a `durationMs`; 32 succeeded events are legacy rows with no duration, and 8 are failures. So 10 is correct for the data, and the count grows to 15 as new runs finish.

### Desired UX
- Verify that only full integrations that merged to main count (not gate-only or self-check runs), and that the sample is the last 15 succeeded.
- If durations can be derived for the 32 legacy succeeded rows (the task activity logs record close-out start and `status → done`/"close-out gate completed in Ns"), backfill them once so the window fills to 15 immediately. If they cannot be derived reliably, leave them out and say so; do not invent durations.

### Acceptance criteria
- Test: with 15+ succeeded timed full close-outs stored, the chip reads "15 runs".
- Test: failed runs and gate-only/self-check runs are excluded.
- If backfill is implemented: a one-time, idempotent migration with a test, and legacy rows it cannot derive stay untouched.

### Notes for AI
Evidence is in this item; do not change the 15 constant. Related: #0814, #0819.

## Problem
Bundle of two small web items about the integration pill tooltip; see Items and the E1/E2 sections.

## Activity

- 2026-10-18T06:17:45Z · created · njachowski@gmail.com
- 2026-10-18T06:17:50Z · needs_input
- 2026-10-18T06:18:02Z · body: Problem (added)
