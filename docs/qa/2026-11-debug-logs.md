# Debug, Logs and Activity QA — November 2026

## Setup and coverage

Built the UI and ran `just serve-noauth 7289` from task #1198's worktree. I used
headless Playwright Chromium against that local app; no visible browser or user
Chrome was opened. Checked the task Debug → Logs view at 1280 × 900 and 375 ×
900. The data volume was supplied through a Playwright route mock for the task
logs endpoint so the pass did not write to the repository's task log.

## Findings and fixes

- Checked 1,000 log rows alongside the task's activity rows. All 1,003 rendered;
  the page stayed at the viewport width at both sizes, with no page exceptions.
- Checked a 12,000-character unbroken URL-like log line and 2,000-character
  expanded context. The expanded output remained within the panel width, and the
  text stayed available. Strengthened wrapping for event titles, expanded
  messages and `<pre>` output with `overflow-wrap: anywhere`; constrained log
  blocks to their parent width and border box. This covers long identifiers in
  addition to ordinary lines with spaces.
- Checked a failed logs request after filtering to Logs. The view rendered its
  empty state (“No debug events yet.”) without horizontal overflow or a page
  exception. This confirms the current non-fatal fetch behavior for a failed
  request; the UI does not distinguish that failure from a genuinely empty log.
- Existing Debug → Logs preview fixture rendered the remote warning, long log
  message and completed log entry at both widths. The page had no horizontal
  overflow.

## Verification

- `bun run test -- tests/debug-event-expand.test.ts` — passed, 14 tests. Added a
  regression case preserving the complete very long unbroken message and its
  expanded context.
- `bun run build:ui` — passed.
- `REPOOS_CHECK_CHANGED=main repoos check` — run recorded by the task handoff.

The large event list was a local mocked response, not an observed 1,000-row
production task. The check covers wrapping, rendering and page width; it does
not claim a benchmark for low-powered devices.
