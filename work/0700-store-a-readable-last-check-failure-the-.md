---
id: "0700"
title: "Store a readable `last_check_failure`: the error line and failing step, not stack frames"
type: feature
status: review
priority: p2
area: server
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: feat/store-a-readable-last-check-failure-the-
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-06T03:15:51Z"
updated_at: "2026-10-07T16:49:17Z"
---
## Problem

tuk-private #0004 carried `last_check_failure: "repoos check at 2026-10-01T09:59:01.647Z: repoos check failed: at afterLoad (node:internal/modules/esm/loader:506:29) · at ModuleLoader.loadAndTranslate ... (truncated)"` — only Node ESM loader frames, no message and no step name. Nobody can act on it from the board.

## Desired UX

The one-line failure says which step failed and the first meaningful error line, with the full log one click away.

## Acceptance criteria

- [ ] The summary is built from the failing step name plus the first non-`at ...` line of its output (falling back to the last non-empty line), capped at the current length.
- [ ] Stack-frame-only output never becomes the summary.
- [ ] Unit tests with an ESM loader trace, a vitest failure and a tsc error.

## Notes for AI

Evidence: `~/code/tuk/tuk-private/repoos/docs/repoos-feedback.md` (tuk-private run, 2026-10-06), item 7.

## Activity

- 2026-10-06T03:15:51Z · created · unknown
- 2026-10-07T16:25:01Z · cli_override, model_override
- 2026-10-07T16:25:03Z · status inbox→ready
- 2026-10-07T16:25:04Z · status ready→active, branch
- 2026-10-07T16:29:41Z · body
- 2026-10-07T16:30:41Z · body
- 2026-10-07T16:49:17Z · status active→review
- 2026-10-07T16:49:17Z · note: shots: skipped — the diff (5 changed paths) touches no [[preview.paths]] globs — no UI change to capture
