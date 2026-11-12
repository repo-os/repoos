---
id: "1097"
title: "landable/close-out: a review that says 'None found' under ## Bugs but explains its checks in bullets is treated as listing blocking bugs"
type: bug
status: active
needs_input: true
needs_input_reason: dev-error
needs_input_detail: "RetriableError: Connection stalled repeatedly"
priority: p2
area: [core, server]
assigned_to: ai
created_by: t@t
branch: feat/landable-close-out-a-review-that-says-no
created_at: "2026-11-12T01:26:13Z"
updated_at: "2026-11-12T04:10:51Z"
dev_error_count: 1
engineer_crash_log: "[{\"cli\":\"cursor\",\"model\":\"composer-2.5\",\"at\":\"2026-11-12T04:10:21.536Z\",\"kind\":\"dev-error\"}]"
---
## Problem
A review whose verdict is 'good to go' and whose ## Bugs section reads 'None found' followed by explanatory prose and bullets (what the reviewer checked) is treated by `repoos landable` as 'the review still lists blocking bugs'. Seen on #1077 (review passes 1 and 2, both 'good to go'): landable stays red on 'Review verdict' and close-out would refuse, so a clean task cannot land and a human has to intervene. Earlier reviews flagged the same quirk ('Bugs-section bullets counted as blocking').

## Desired UX
The verdict line decides: 'good to go' plus a Bugs section that begins with 'None found' (or is empty) is landable, whatever follows it. Bullets after 'None found' are commentary, not findings.

## Acceptance criteria
- A review with verdict 'good to go' and '## Bugs' starting with 'None found' followed by bullets and prose is landable.
- A review with real numbered or bulleted findings and no 'None found' opener still blocks.
- A review with 'None found' and later numbered findings (mixed) still blocks (fail closed) — pick and document the rule.
- Tests for each; reviewer prompt gets one line telling it to put its checked-items list under Edge cases or a separate heading, not under ## Bugs.
- Docs: docs/close-out-pipeline.md or user-docs/review-and-close-out.md one line.

## Notes for AI
The parser is in `src/core/review-report-sections.ts`: `reviewReportHasBlockingBugs` (~line 216) is `!!extractReviewReportSections(markdown).bugs`, and `sectionContent` drops a section only when `isEmptyReviewSection` (~lines 105-132) says it is empty. That function skips lines that are a 'none' statement, but returns false for ANY other list-marker line (`if (LIST_MARKER.test(line)) return false`), which is why 'None found' followed by explanatory bullets reads as findings.

Suggested rule (decide and document): when the first non-empty line of ## Bugs is a none statement, treat the rest of the section as commentary UNLESS it contains a numbered finding (`1.`, `2.`) or a bold-label finding, which stays blocking (fail closed for mixed content). Keep the existing behaviour for sections that do not open with a none statement.

Callers: `src/server/landable.ts:72` (`blockingBugs`), `src/core/landable.ts` (the 'review-verdict' check), `src/core/decision-digest.ts`. Existing tests: `src/ui-app/tests/landable.test.ts`, `landable-gather.test.ts`; add table tests next to the section-parser tests. The reviewer prompt lives with the other built-in agent prompts; add one line: list what you checked under ## Edge cases or its own heading, never under ## Bugs. Real example that failed: #1077 review passes 1 and 2 (`work/reports/1077/review-1.md`, `review-2.md`), both 'good to go'. Do not touch repoos.toml.

## Activity

- 2026-11-12T01:26:13Z · created · t@t
- 2026-11-12T01:26:14Z · needs_input
- 2026-11-12T03:33:28Z · body: Notes for AI (added)
- 2026-11-12T03:33:32Z · status inbox→ready
- 2026-11-12T03:33:36Z · status ready→active, needs_input, branch
- 2026-11-12T03:46:15Z · message_queued at 2026-11-12T03:46:15.338Z
- 2026-11-12T03:46:15Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-12T03:51:15Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-12T04:03:26Z · body
- 2026-11-12T04:10:21Z · agent exited with an error (cursor) · RetriableError: Connection stalled repeatedly
- 2026-11-12T04:10:51Z · engineer crash recovery: resuming cursor + composer-2.5 (1/12 crashes in 30m) · RetriableError: Connection stalled repeatedly
