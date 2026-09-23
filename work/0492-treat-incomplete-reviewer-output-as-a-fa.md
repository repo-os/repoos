---
id: "0492"
title: Treat incomplete reviewer output as failed review
type: feature
status: active
priority: p2
area: core
assigned_to: ai
created_by: hello@repoos.org
branch: feat/treat-incomplete-reviewer-output-as-fail
pm_cli_override: cursor
pm_model_override: composer-2.5
review_cli_override: cursor
review_model_override: composer-2.5
created_at: "2026-09-23T04:31:37Z"
updated_at: "2026-09-23T07:01:51Z"
review_rounds: 1
review_passes: 3
---
## Problem

When a task enters `review`, RepoOS runs the review agent and persists its report under `.repoos/reviews/<id>.md`. Completion logic in `finalizeRun` (`src/server/review.ts`) treats any non-empty extracted report as success: `state: ok`, emits `review` → `ready`, appends “✓ review complete”, increments `review_passes`, and may auto-bounce when a verdict is parsed.

That success gate is **output presence**, not a **parseable verdict**. The review prompt asks for one of three outcomes — `` `good to go` ``, `` `needs some work` ``, `` `back to the drawing board` `` — and shared parsing lives in `src/core/review-verdict.ts` (used by the server auto-bounce gate and the UI via `parseReviewVerdict`). If the agent stops mid-run with “thinking aloud” text but never states a verdict, the run still counts as a completed pass.

Humans then see a partial report with no actionable outcome. The board/drawer can imply a successful review (e.g. “review passed” / ready-to-finish hints when no verdict contradicts it) even though auto-bounce correctly does nothing when `parseVerdict` returns null. `review_passes` advances anyway, so D/R-style counters drift from meaningful review rounds.

## Desired UX

- A review run is **complete** only when the persisted report contains a **parseable verdict** (same rules as `parseReviewVerdict` today).
- **Empty or missing report** (timeout, crash, no usable output): keep treating as a failed review — no verdict, no pass increment — consistent with current `state: failed` behavior unless this task intentionally aligns empty and partial under one “incomplete” UX bucket.
- **Non-empty report without a valid verdict**: save the markdown for debugging (do not discard the agent’s partial output), mark the review as **incomplete** (distinct from both “failed, no report” and “ok with verdict”), and surface that clearly on the **task card** and **task drawer** (badge/substate/copy — not “review passed”, not a green verdict callout).
- Do **not** increment `review_passes` for incomplete runs.
- Do **not** run auto-bounce for incomplete runs (task stays in `review` waiting for a human).
- Provide a **retry** path (e.g. reuse or expose “Review again” when the last run was incomplete) so a human can kick off a fresh review without confusion.
- When a verdict **is** present, behavior stays as today: show the colored verdict, apply auto-bounce for anything other than “good to go”, and count the pass.

## Acceptance criteria

- [ ] `finalizeRun` (and any parallel completion path for review, e.g. durable-session finalize) does not set `state: ok` or bump `review_passes` unless `parseReviewVerdict(report.markdown)` returns a verdict.
- [ ] Non-empty output with no parseable verdict is written to `.repoos/reviews/<id>.md` (or equivalent store) with a review state that means **incomplete**, exposed on the review API the UI already consumes.
- [ ] Task drawer does not show “review passed” / ready-to-finish treatment when the latest review is incomplete; incomplete state is visible in copy and/or substate badge.
- [ ] Task card reflects incomplete review (not a passed-review hint, not a verdict badge unless a verdict exists).
- [ ] Auto-bounce does not run when the latest review is incomplete.
- [ ] User can retry review from the UI (or existing “Review again” is enabled and labeled appropriately for incomplete).
- [ ] Tests in `src/ui-app/tests/agent-review.test.ts` (or adjacent review tests) cover: empty/no report → failed (no pass increment); partial markdown without any of the three verdict strings → incomplete (report persisted, no pass increment, no auto-bounce); each valid verdict string → `state: ok`, pass incremented, and auto-bounce behavior unchanged for non–“good to go” verdicts.

## Notes for AI

- **Root cause:** `src/server/review.ts` around `finalizeRun` — `state: ok` is `ok && reportText`, not verdict-aware. Auto-bounce already gates on `parseVerdict`; UI hints in `TaskCard.vue` / `TaskDrawer.vue` use `parseReviewVerdict` but pass counting does not.
- **Reuse** `parseReviewVerdict` from `src/core/review-verdict.ts` for the server gate; do not fork another parser.
- **Assumption:** Introduce an explicit review report state (e.g. `incomplete`) rather than overloading `failed` with different copy for “no output” vs “partial, no verdict”, unless a minimal diff can distinguish them cleanly in API + UI without confusing `needsInput` / `review-failed` escalation. Partial incomplete should **not** necessarily trigger the same `needsInput` escalation as a total failure unless product copy in this task says otherwise — default: incomplete = human retries review, no auto-bounce, no pass bump.
- **Do not** change review agent prompt wording or verdict vocabulary in this task unless required for tests.
- **Do not** widen formatter scope; run `bun run fmt` before commit on the task branch.
- Extend types in `src/server/review.ts` (`ReviewReport["state"]`) and any consumers (`live-index`, `repo` store, SSE `review` events) so incomplete propagates to the board.
- Check `user-docs/review-and-close-out.md` only if behavior visible to users changes; scoped one-line update if the doc claims any non-empty report counts as a completed review.

## Scope

**In scope:** Server review completion, `review_passes` bookkeeping, auto-bounce guard, API/report persistence, task drawer + task card presentation, retry affordance, automated tests listed above.

**Out of scope:** Changing how reports are extracted from agent CLIs, reviewer model/prompt tuning, or redefining the three verdict strings.

## Related

- `user-docs/review-and-close-out.md` — documents verdicts and auto-bounce.
- `src/core/review-verdict.ts` — shared verdict parsing (#0402 alignment).
- Prior UI fix: board “review passed” vs actual verdict (`src/ui-app/src/lib/reviewVerdict.ts` header comment).

## Original prompt

Treat incomplete reviewer output as a failed/incomplete review, not a successful review pass. Currently, RepoOS records any non-empty reviewer output as state: ok and increments review_passes, even if the reviewer never emits one of the required verdicts (good to go, needs some work, back to the drawing board). This leaves tasks in review with a partial ‘thinking aloud’ report, no actionable outcome, and confusing UI state.
Require a parseable verdict before marking a review complete or incrementing review_passes. If output is non-empty but has no valid verdict, persist it for debugging but mark the review as incomplete, clearly surface that state in the task drawer/card, do not show ‘review passed,’ do not trigger auto-bounce, and provide a retry action. Add tests for empty output, partial output without a verdict, and each valid verdict.

## Screenshots

![Screenshot-2026-09-23-at-11.31.11](/api/tasks/0492/attachments/screenshot-1.png)

## Activity

- 2026-09-23T04:31:37Z · created · hello@repoos.org
- 2026-09-23T04:31:38Z · screenshots
- 2026-09-23T04:32:37Z · status draft→inbox, title, area, body
- 2026-09-23T04:57:41Z · review_cli_override, review_model_override
- 2026-09-23T04:57:48Z · review_model_override
- 2026-09-23T04:57:51Z · status inbox→ready
- 2026-09-23T04:57:52Z · status ready→active, branch
- 2026-09-23T05:42:42Z · status active→review
- 2026-09-23T05:44:55Z · status review→active
- 2026-09-23T05:44:55Z · note: apply the suggestions if they make sense
- 2026-09-23T06:34:32Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-09-23T06:36:23Z · status active→review
- 2026-09-23T06:59:25Z · status review→active
- 2026-09-23T07:00:13Z · status active→review
- 2026-09-23T07:01:51Z · status review→active
