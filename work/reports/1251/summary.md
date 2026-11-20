## TL;DR

Task #1251 shipped a headless performance QA pass for the Work board under a 1200-task generated fixture, plus three script-level fixes to board rendering and a committed QA document with measured numbers at 375/768/1280 px. One engineering round (haiku), one review pass (verdict: good to go), merged as commit 782b02d8 with release:success. The only unresolved items are open questions recorded in the QA doc (possible slower Done expand at 768 px, unexplained long idle frames) and a real-device touch-scroll check that has no owner because no follow-up task was filed.

## Outcome

The branch `feat/qa-pass-work-board-in-a-project-with-hun` shipped:

- **Rendering fixes** to the large-board path: `sortTasks` now derives each Done sort key once instead of running the activity-log regex inside the comparator; `withoutHiddenTasks` returns the same array when a filter hides nothing, so the Done column no longer re-sorts on unrelated filter toggles; `keepSameIds`/`keepSameList` preserve identity of recomputed values so the held list stops re-rendering the board once a second during an active hold.
- **A test fixture and harness**: `makeLargeBoard(1200)` builds a server-shaped `/api/board` payload in memory; the harness serves the built `dist/ui` headlessly in Playwright's bundled WebKit, with no live server or visible browser.
- **Regression tests**: `board-visibility-perf.test.ts` (pure helpers and Done ordering, 11 unit tests) and `work-board-large-perf-browser.test.ts` (three widths, 3 browser budgets asserting structure: Done mounts ≤40 cards, kept cards don't move, scroll never clamped, phone list pages).
- **A measurement script** (`docs/qa/measure-large-board-perf.mjs`) and the required QA document `docs/qa/2026-11-large-board-perf-qa.md`, with a fresh fixed-build run recording e.g. open-to-first-card 341 ms (375 px), 646 ms (768), 667 ms (1280), filter paints 24–120 ms, Done expand 94–106 ms at 768/1280.

Final verdict: review pass 1 returned **good to go** (evidence-gap-only). Close-out gate passed (1494 s), the branch merged as commit `782b02d804d42571f8dc59ad650021d3fce56152`, and the task closed as done with release:success on 2026-11-20T00:45:17Z.

## Process stats

- **Dev rounds:** 1 (Round 1, agent "claude code", model haiku). **Review rounds:** 1, verdict good to go.
- **Wall-clock start to done:** 2 h 18 m 21 s (created 2026-11-19T22:26:56Z → done 2026-11-20T00:45:17Z).
- **Engineer:** model haiku, session started 2026-11-19T22:27:07Z, elapsed 3082 s (~51 m 22 s), 14,679 tokens, cost $0.03625754, status "finished" with the note that the agent process exited with an error.
- **Reviewer:** agent "reviewer", model opencode-go/glm-5.3-flash, elapsed 107 s, 54,345 tokens, cost $0.02077328.
- **Routing:** model router (jev), 0 s elapsed, no tokens or cost recorded.
- **Totals:** 69,024 tokens and $0.05703082 across the two recorded LLM rows (routing row excluded; no figures recorded for it).
- **Restarts or swaps:** none recorded. One "engineer stopped by request" event at 2026-11-19T23:06:54Z.
- **Close-out gate:** completed in 1494 s.

## What went wrong

- **Engineer process exited with an error** (per the sessions table, after 3082 s). The activity log also records the engineer being "stopped by request" at 23:06:54Z. Work was not lost: the fixes, fixture, measure script and tests were already in a WIP commit, and the recorded Round 1 verified that existing work (build clean, both large-board test files passing, one fresh measurement run consistent with the doc) rather than rewriting it. How the stop, the error exit and the round relate beyond this is not recorded.
- **Scoped `repoos check` skipped the unit-test step** in the engineer's environment (`REPOOS_SKIP_TESTS=1` on the remote runner). Resolved by running the two large-board test files directly (they passed); the full suite ran at close-out, which succeeded.
- **Handoff evidence gap:** the automatic UI capture showed Mission Control instead of the touched `/work` board, and no shots had been declared for it. The review passed as "good to go — EVIDENCE-GAP-ONLY" with the console-error check clean; the gap was noted as a suggestion for the next pass (declare `/work` and `/work?status=done` shots), not fixed on this task.
- **Queued message went undelivered:** a message queued at 23:22:09Z was flagged overdue at 00:27:11Z ("still queued after 60m without being delivered"). Delivery was never recorded; close-out proceeded anyway and the message did not block the gate.
- **Unresolved measurement questions** (recorded in the QA doc, not fixed): Done expand at 768 px measured slower on the fixed build (median 89→111 ms, non-overlapping ranges) with no isolated cause; desktop idle frames remain long (8–12 frames >50 ms in 4 s) with the source unidentified.

## Learnings

- A fix that removes script work can be invisible in wall-clock time when the remaining cost is native layout and paint — measure frame gaps and paint time, not only script time, before claiming a speedup. This belongs in `docs/agent-ui-and-preview-conventions.md` (not recorded whether it was added there).
- Preserving array/Set identity from a computed is a cheap way to stop pointless re-renders, worth doing where a computed re-derives on a timer (the held list does so every second).
- Record a perf baseline as a commit hash, not `HEAD`: once the fix commits, `HEAD` names the fixed build and the before/after comparison silently inverts. The QA doc was corrected to name parent commit `fbb3b0f3c`.
- The phone Done list pages (12 at a time) but does not window; DOM cost grows with every "Show more" and only a real device can judge whether that matters. Windowing `MobileWorkQueue.vue` was deliberately deferred.

## Follow-ups

None recorded. Note for the reader: the reviewer explicitly recommended filing a held human task (via `repoos new … --depends-on 1251`) for the real-device 375 px touch-scroll/momentum check before close-out, and the QA doc treats the phone measurements as headless-WebKit-only — but the linked-task record is empty, so that human verification currently has no owning task and should be picked up.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
