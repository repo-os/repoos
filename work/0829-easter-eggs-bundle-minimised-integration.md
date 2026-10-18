---
id: "0829"
title: "Easter eggs bundle: integration pill tooltip, median run count, and full Debug log messages"
type: bug
status: review
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/easter-eggs-bundle-integration-pill-tool
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-18T06:17:45Z"
updated_at: "2026-10-18T08:22:35Z"
review_passes: 3
review_rounds: 2
---
## Items
- [ ] **E1 · Minimised pill shows only the median popup, centered** (web) — remove the extra native title tooltip over it. Source: Nick 2026-10-18.
- [ ] **E2 · Median run count: explain "10 runs" and backfill if possible** (web, server) — the agreed window is the last 15 succeeded full close-outs. Source: Nick 2026-10-18.
- [ ] **E3 · Debug logs: expanded row always shows the full message** (web) — rows truncated with an ellipsis must expand to the whole message. Source: Nick 2026-10-18.

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

## Desired UX
E1: only the median popup, centered, in the minimised pill. E2: an accurate run count (15 succeeded full close-outs when available). Detail per item below.

## Acceptance criteria
See each item's Acceptance criteria (E1, E2); both must hold.

## Notes for AI
Items are independent; never touch repoos.toml; edit per-item notes in the E1/E2 sections.

## E3 · Debug logs: expanded row always shows the full message
### Problem
In the task drawer Debug tab Logs view, a long message is truncated with an ellipsis in the main row (CSS `text-overflow: ellipsis` in `src/ui-app/src/components/DebugPanel.vue`), but expanding it does not reliably show the full text. Rows with structured data show only the JSON payload below (e.g. "main advanced with bookkeeping-only commits — publishing without a …" expands to just `{"from":…,"to":…}`), some expansions only repeat the short message ("close-out gate completed in 422s"), and some rows have no expander at all ("close-out complete — published to main", "remote validation passed in 310s", "close-out gate: scoped — main advanced with code changes — scoped …"). Rows are built around lines 171–223 (`title` = message, `detail` only when there is extra data); the expand toggle is at ~329 and the detail `<pre>` at ~528.

### Desired UX
- Every log/activity/remote row is expandable, and the expanded area always starts with the full, wrapped, selectable message, followed by any structured data/detail (JSON payload, command output) below it.
- Rows whose message fits on one line without truncation may skip the duplicate message block when there is no other detail (no empty expander), but any truncated row must be expandable.
- A message that is identical to the detail is shown once.

### Acceptance criteria
- Test: a row whose message is truncated is expandable and the expanded area contains the complete message text.
- Test: a row with a JSON payload shows the full message and the payload.
- Test: a row whose detail equals its message shows the text once.
- Test: short, non-truncated rows with no detail do not get an empty expander.
- Declared shot of the Debug tab Logs with the long "main advanced…" row expanded (use a real task id and fixture, not 9999).

### Notes for AI
Detect truncation at render time (scrollWidth > clientWidth) or always allow expand for messages over a length threshold; pick one and say which. Do not change the data stored in the logs. Source: Nick 2026-10-18, screenshot of #0820 Debug logs.

## Shots
```json
[
{
"label": "Minimised pill median tooltip (light)",
"target": "default",
"route": "/",
"highlight": "[data-test-id=\"integration-timer-tip\"]",
"steps": [
  {
    "waitFor": ".ibar-strip [data-test-id=\"integration-timer\"]"
  },
  {
    "click": ".ibar-strip [data-test-id=\"integration-timer\"]"
  },
  {
    "waitFor": "[data-test-id=\"integration-timer-tip\"]"
  }
],
"state": "integration:median15",
"theme": "light"
},
{
"label": "Minimised pill median tooltip (dark)",
"target": "default",
"route": "/",
"highlight": "[data-test-id=\"integration-timer-tip\"]",
"steps": [
  {
    "waitFor": ".ibar-strip [data-test-id=\"integration-timer\"]"
  },
  {
    "click": ".ibar-strip [data-test-id=\"integration-timer\"]"
  },
  {
    "waitFor": "[data-test-id=\"integration-timer-tip\"]"
  }
],
"state": "integration:median15",
"theme": "dark"
},
{
"label": "Debug log expanded full message (light)",
"target": "default",
"route": "/work?task=0820&tab=debug",
"highlight": ".debug-event-message",
"steps": [
  {
    "waitFor": ".debug-event-expandable"
  },
  {
    "click": ".debug-event-expandable"
  },
  {
    "waitFor": ".debug-event-message"
  }
],
"state": "drawer:debugLogs",
"theme": "light"
},
{
"label": "Debug log expanded full message (dark)",
"target": "default",
"route": "/work?task=0820&tab=debug",
"highlight": ".debug-event-message",
"steps": [
  {
    "waitFor": ".debug-event-expandable"
  },
  {
    "click": ".debug-event-expandable"
  },
  {
    "waitFor": ".debug-event-message"
  }
],
"state": "drawer:debugLogs",
"theme": "dark"
}
]
```

## Activity

- 2026-10-18T06:17:45Z · created · njachowski@gmail.com
- 2026-10-18T06:17:50Z · needs_input
- 2026-10-18T06:18:02Z · body: Problem (added)
- 2026-10-18T06:18:10Z · body: Desired UX (added)
- 2026-10-18T06:18:17Z · body: Acceptance criteria (added)
- 2026-10-18T06:18:23Z · body: Notes for AI (added)
- 2026-10-18T06:18:32Z · needs_input
- 2026-10-18T06:48:56Z · body: Items (added 1)
- 2026-10-18T06:49:00Z · body: E3 · Debug logs: expanded row always shows the full message (added)
- 2026-10-18T06:49:05Z · title
- 2026-10-18T06:50:50Z · status inbox→ready
- 2026-10-18T06:50:53Z · cli_override, model_override
- 2026-10-18T06:50:55Z · status ready→active, branch
- 2026-10-18T06:54:01Z · body
- 2026-10-18T06:54:49Z · body
- 2026-10-18T06:56:00Z · body
- 2026-10-18T06:57:02Z · body
- 2026-10-18T06:58:37Z · body
- 2026-10-18T06:59:22Z · body
- 2026-10-18T07:07:00Z · status active→review
- 2026-10-18T07:07:13Z · note: highlight [data-test-id=integration-timer] matched nothing on /
- 2026-10-18T07:07:27Z · note: click .debug-event-expandable: click: Error: strict mode violation: locator('.debug-event-expandable') resolved to 12 elements: on /work?task=0820&tab=debug
- 2026-10-18T07:07:28Z · note: highlight .debug-event-message matched nothing on /work?task=0820&tab=debug
- 2026-10-18T07:08:15Z · note: review pass 1: needs some work
- 2026-10-18T07:08:15Z · status review→active
- 2026-10-18T07:09:26Z · body
- 2026-10-18T07:10:23Z · body
- 2026-10-18T07:12:13Z · body
- 2026-10-18T07:20:01Z · status active→review
- 2026-10-18T07:20:02Z · note: shots: skipped — 2 handoff shots already captured for this exact plan (780f377a6) during finalization (#0734)
- 2026-10-18T07:20:03Z · note: shots: skipped — 2 handoff shots already captured for this exact plan (780f377a6) during finalization (#0734)
- 2026-10-18T07:21:02Z · note: review pass 2: needs some work
- 2026-10-18T07:21:03Z · status review→active
- 2026-10-18T07:21:43Z · body
- 2026-10-18T07:22:58Z · body
- 2026-10-18T07:31:05Z · status active→review
- 2026-10-18T07:31:31Z · note: waitFor [data-test-id=integration-timer]: waitFor: Timeout 5000ms exceeded. on /
- 2026-10-18T07:31:32Z · note: click [data-test-id=integration-timer]: click: Timeout 5000ms exceeded. on /
- 2026-10-18T07:31:32Z · note: waitFor [data-test-id=integration-timer-tip]: waitFor: Timeout 5000ms exceeded. on /
- 2026-10-18T07:31:32Z · note: highlight [data-test-id=integration-timer-tip] matched nothing on /
- 2026-10-18T07:31:51Z · note: waitFor [data-test-id=integration-timer]: waitFor: Timeout 5000ms exceeded. on /
- 2026-10-18T07:31:51Z · note: click [data-test-id=integration-timer]: click: Timeout 5000ms exceeded. on /
- 2026-10-18T07:31:51Z · note: waitFor [data-test-id=integration-timer-tip]: waitFor: Timeout 5000ms exceeded. on /
- 2026-10-18T07:31:51Z · note: highlight [data-test-id=integration-timer-tip] matched nothing on /
- 2026-10-18T07:32:11Z · note: review pass 3: needs some work
- 2026-10-18T07:32:11Z · needs_input
- 2026-10-18T07:32:19Z · note: waitFor [data-debug-event*='main advanced']: waitFor: Timeout 5000ms exceeded. on /work?task=0820&tab=debug
- 2026-10-18T07:32:20Z · note: click [data-debug-event*='main advanced']: click: Timeout 5000ms exceeded. on /work?task=0820&tab=debug
- 2026-10-18T07:32:20Z · note: waitFor .debug-event-message: waitFor: Timeout 5000ms exceeded. on /work?task=0820&tab=debug
- 2026-10-18T07:32:20Z · note: highlight .debug-event-message matched nothing on /work?task=0820&tab=debug
- 2026-10-18T08:09:44Z · status review→active
- 2026-10-18T08:09:55Z · needs_input
- 2026-10-18T08:09:56Z · message_queued at 2026-10-18T08:09:56.429Z
- 2026-10-18T08:12:07Z · body
- 2026-10-18T08:13:33Z · body
- 2026-10-18T08:14:16Z · body
- 2026-10-18T08:22:35Z · status active→review
