---
id: "0894"
title: Review report parser treats 'None found.' (or any phrasing other than exact 'None found') in Bugs as blocking bugs
type: bug
status: active
needs_input: true
needs_input_reason: dev-error
needs_input_detail: "error: Upstream request failed: Endpoint is unavailable."
priority: p2
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/review-report-parser-treats-none-found-o
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-10-21T08:17:11Z"
updated_at: "2026-10-21T08:19:07Z"
dev_error_count: 1
engineer_crash_log: "[{\"cli\":\"opencode\",\"model\":\"opencode-go/deepseek-v4.1-flash\",\"at\":\"2026-10-21T08:19:07.268Z\",\"kind\":\"dev-error\"}]"
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
