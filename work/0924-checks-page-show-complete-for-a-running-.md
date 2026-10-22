---
id: "0924"
title: "Checks page: show % complete for a running check (steps and test files)"
type: feature
status: ready
priority: p2
area: [web, core]
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-22T06:08:54Z"
updated_at: "2026-10-22T14:03:21Z"
---
## Problem
A running check (engineer self-check, handoff, close-out) shows only elapsed time and a log tail. Nick cannot tell whether a 40-minute run is 10% or 90% done, or whether it is looping (incident 2026-10-22, #0909: the test step timed out at 420s twice and restarted, invisible from the UI).

## Desired UX
On the Checks page, the task drawer's check banner and the close-out button: a progress bar with 'step 5 of 12 · tests 140/289 files · 4m10s'. Step progress comes from the check plan (steps done / total, skipped steps excluded). Inside the tests step, file progress comes from the vitest run: total file count from a one-time list at start, completed count from the reporter (the run-tests.mjs wrapper emits a machine-readable progress line per finished file). Show 'attempt 2' and the reason when a step restarts after a timeout. If total is unknown, show steps only; never show a fake percentage.

## Acceptance criteria
- Check runs persist steps_done/steps_total and tests_done/tests_total (checks.db migration, nullable).
- The UI shows the bar and updates live (SSE) for local and remote runs.
- A restarted step visibly resets and shows its attempt number.
- Tests cover the progress line parsing and the bar with unknown totals.

## Notes for AI
Do not change the check plan or step semantics; this is reporting only. Related: #0921 (slot visibility), #0917 (upload progress).

## Queue wording
Shorten the local-slot queue message. The banner already says 'queued', so 'waiting for a local check slot (2 ahead, position 3)' repeats itself. Show just 'queued #3' (position in line; 'queued' alone when first) in src/core/local-gates.ts (~line 142) and src/ui-app/src/lib/local-queue-hint.ts, with the full sentence only in the hover/tooltip. Update the tests that assert the old text. (Nick, 2026-10-22)

## Activity

- 2026-10-22T06:08:54Z · created · njachowski@gmail.com
- 2026-10-22T07:11:55Z · body: Queue wording (added)
- 2026-10-22T14:03:21Z · status inbox→ready
