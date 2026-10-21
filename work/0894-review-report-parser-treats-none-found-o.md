---
last_handoff_failure_fingerprint: check|server-side finalization timed out (deadline exceeded)
last_handoff_failure_sha: a0f2fd958dde8df75ca69c6cded5088a9c7793c5
id: "0894"
title: Review report parser treats 'None found.' (or any phrasing other than exact 'None found') in Bugs as blocking bugs
type: bug
status: active
priority: p2
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/review-report-parser-treats-none-found-o
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-21T08:17:11Z"
updated_at: "2026-10-21T11:18:00Z"
review_passes: 1
dev_error_count: 2
engineer_crash_log: "[{\"cli\":\"opencode\",\"model\":\"opencode-go/deepseek-v4.1-flash\",\"at\":\"2026-10-21T08:19:07.268Z\",\"kind\":\"dev-error\"},{\"cli\":\"opencode\",\"model\":\"opencode-go/deepseek-v4.1-flash\",\"at\":\"2026-10-21T08:22:38.129Z\",\"kind\":\"dev-error\"}]"
---
## Problem
`reviewReportHasBlockingBugs` (src/core/review-report-sections.ts) decides there are blocking bugs whenever the `## Bugs` section has any text other than exactly `None found`. A reviewer who writes `None found.` (trailing period), `None`, `None found — see edge cases`, `No bugs found`, `N/A` or an empty-ish bullet is parsed as having blocking bugs. Observed 2026-10-21 on #0890: the review verdict is `good to go`, Bugs says `None found.`, and `repoos landable` / the Landable panel reports "Not landable yet: Review verdict — the review still lists blocking bugs". The same helper backs the review auto-bounce path and the approval policy gate (its own doc comment says so), so harmless phrasing can also bounce a reviewed task back to its engineer or fail an approval check. Reviewer agents vary their wording between runs and models.

## Desired UX
A Bugs section that says there are none, in any reasonable phrasing, never counts as blocking. Only a section that actually lists findings counts.

## Acceptance criteria
- A shared `isEmptyReviewSection(text)` (or equivalent) decides "nothing to report": case-insensitive, ignores punctuation, markdown emphasis, backticks, bullets and surrounding whitespace, and accepts at least `None`, `None found`, `None found.`, `No bugs`, `No bugs found`, `No issues found`, `N/A`, `Nothing found`, `-`, and an empty section.
- It also tolerates a leading qualifier line like `None found.` followed by prose that lists no bullet findings; a section is blocking only if it contains a bullet or numbered finding, or a bold `**<label>:**` finding line, that is not itself a "none" statement.
- `extractReviewReportSections` uses it for Bugs, Edge cases and Suggestions alike, so the review auto-bounce, the approval gate and the landable check all agree.
- Table-driven tests with every phrasing above (empty and non-empty) through all three consumers.
- Add a line to the reviewer prompt guidance (default agent prompts, from #0872) asking reviewers to write exactly `None found` when there are no bugs, as a belt and braces, but the parser must not depend on it.

## Notes for AI
Consumers: src/server/landable.ts (line ~51), the review auto-bounce path in src/server/review.ts and the approval policy gate; grep for `reviewReportHasBlockingBugs` and `extractReviewReportSections`. Run each consumer's tests in small groups.

## Activity

- 2026-10-21T08:17:11Z · created · njachowski@gmail.com
- 2026-10-21T08:17:23Z · status inbox→ready
- 2026-10-21T08:17:28Z · cli_override, model_override
- 2026-10-21T08:17:30Z · status ready→active, branch
- 2026-10-21T08:19:07Z · agent exited with an error (opencode) · error: Upstream request failed: Endpoint is unavailable.
- 2026-10-21T08:19:07Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4.1-flash (1/3 crashes in 30m) · error: Upstream request failed: Endpoint is unavailable.
- 2026-10-21T08:22:35Z · note: stopped orphaned engineer pid 92447
- 2026-10-21T08:22:38Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4.1-flash (2/3 crashes in 30m) · error: Upstream request failed: Endpoint is unavailable.
- 2026-10-21T08:26:15Z · body
- 2026-10-21T08:43:03Z · body
- 2026-10-21T08:46:14Z · body
- 2026-10-21T08:51:32Z · body
- 2026-10-21T09:02:10Z · body
- 2026-10-21T09:08:38Z · body
- 2026-10-21T09:11:08Z · cli_override, model_override
- 2026-10-21T09:15:22Z · needs_input
- 2026-10-21T09:15:31Z · status active→ready
- 2026-10-21T09:15:35Z · status ready→active
- 2026-10-21T09:17:53Z · cli_override, model_override
- 2026-10-21T09:18:11Z · status active→ready
- 2026-10-21T09:18:15Z · status ready→active
- 2026-10-21T09:19:01Z · body
- 2026-10-21T10:16:58Z · message_queued at 2026-10-21T10:16:58.082Z
- 2026-10-21T10:17:28Z · note: handoff requested (ui-review)
- 2026-10-21T10:19:26Z · status active→review
- 2026-10-21T10:19:26Z · note: shots: skipped — the diff (9 changed paths) touches no capture target's globs — no UI change to capture
- 2026-10-21T10:20:16Z · note: review pass 1: good to go
- 2026-10-21T10:20:24Z · body
- 2026-10-21T10:23:15Z · body
- 2026-10-21T10:26:40Z · body
- 2026-10-21T10:31:09Z · body
- 2026-10-21T10:31:37Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-10-21T10:40:48Z · handoff failed · ui-review handoff failed at check · remote validation failed: test failure: tests/agent-concurrency.test.ts > agent start concurrency cap > queues starts beyond maxConcurrentAgents and drains them as slots free, tests/agent-concurrency.test.ts > agent start concurrency cap > a queued task cannot be double-started while waiting for a slot, tests/agent-drivers.test.ts > qwen code driver > spawns headless args, streams output, and resumes by session id on thinkpad — fix it in the feature branch and re-run the gate
- 2026-10-21T10:45:35Z · status review→active
- 2026-10-21T10:46:10Z · note: handoff requested (ui-review)
- 2026-10-21T11:17:59Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T11:18:00Z · handoff failed · ui-review handoff failed at check · server-side finalization timed out (deadline exceeded)

