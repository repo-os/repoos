---
id: summary
title: summary
type: feature
status: inbox
priority: p2
area: general
assigned_to: ai
created_by: ""
branch: ""
---
## TL;DR

Task 1272 fixed the close-out timer on task cards so it counts only from when validation actually starts (`startedAt`), not from when the job was queued. The root cause was a fallback in `src/server/integration-status.ts` that used a queued job's `enqueuedAt` when `startedAt` was null, making a queued job look like the active close-out with a clock already running. The fix classifies a job as active only once it has left the queue, lists unstarted jobs with their queue position, and stops any timer from counting before that point. One engineering round, one review pass (verdict `good to go`), merged and released successfully.

## Outcome

The reported symptom was a Checks timer showing ~20 minutes on a card that had only just started, with a queued card showing no clear state. Shipped changes:

- **`src/server/integration-status.ts`** — the active job is now the first job with `attemptIsExecuting` true; queued jobs go into the queue list with positions starting at 1, and the queue detail is built in both branches (previously the no-active branch returned no `queueDetail`).
- **`src/ui-app/src/lib/closeOutAttempt.ts`** — timer helpers read only the validating start; the enqueue-time rule that #0741 needed for stale-failure detection was kept but moved into a separate `closeOutFailureCutoff` helper, so no timer reads an enqueue time.
- **`IntegrationPipelineSummary.vue` / `TaskCard.vue`** — queue chips now say "waited Nm" instead of "pos N · Nm", and the summary says "Queued — waiting for the next close-out to start" when there is no active job but the queue is non-empty.
- **Tests** — new `close-out-timer-1272.test.ts` covers queued, validating and retried states with a fake clock (a retry resets the job to queued with `startedAt: null`, so the clock restarts from its own start); `close-out-attempt.test.ts` covers the helpers; three fixtures in `integration-snapshot-detail.test.ts` and `mtd-cancel.test.ts` were updated to describe started jobs.

All three acceptance criteria were met: the timer uses the validating phase start, queued jobs show queue position without an elapsed timer, and the three states are tested. Review pass 1 returned `good to go`; the task merged (commit `b470a939f4f31eef5b0e0b5d669537713f4abf84`) and closed with `release:success`.

One honest caveat, flagged by both engineer and reviewer: the screenshot's "Checks 20m 29s" figure may come from the card's check-run clock (`cardChecksDisplay` in `TaskCard.vue`), a separate clock from the close-out job. This change fixes the close-out clock per the acceptance criteria; whether the long Checks figure persists on a live run was not verified.

## Process stats

- **Rounds:** 1 engineering round (haiku, via Claude Code); 1 review pass (`good to go`, opencode, model `opencode-go/glm-5.3-flash`). No restarts or model swaps recorded; one `cli_override`/`model_override` event is logged at 2026-11-20T06:26:58Z, details not recorded.
- **Wall-clock, created → done:** 6h 46m 47s (2026-11-20T06:08:31Z → 12:55:18Z). Most of that was the reviewed task waiting in the close-out queue: review verdict at 07:42:23Z, close-out gate completed at 12:52:32Z (562s gate run), status done at 12:55:18Z.
- **Sessions:**
- engineer — haiku, started 06:27:03.681Z, elapsed 4256s (1h 10m 56s), 62,458 tokens, $0.50147667
- reviewer — opencode-go/glm-5.3-flash, elapsed 102s, 51,053 tokens, $0.02034646
- routing — Model router (jev), elapsed 0s, tokens and cost not recorded
- **Totals (sum of the two recorded sessions):** 113,511 tokens, $0.52182313.

## What went wrong

- **Real test failure during development:** the `mtd-cancel` expectation failed because the intentional behavior change makes the next job queued rather than active. Resolved by updating the test's expectation to match the new, intended behavior.
- **Sign-in browser check failed** because the task worktree had no local build (`dist/` is gitignored; a fresh worktree has none). Resolved by running `bun run build`, after which the check passed. The final handoff evidence (browser console-error check) passed at 07:40:31Z.
- **Handoff message stuck in queue:** the handoff message queued at 07:40:40Z was flagged overdue at 08:54:36Z ("still queued after 60m without being delivered") and was finally discarded at 12:52:46Z because the task was done. Why delivery stalled for the roughly five hours between the review verdict and the close-out gate completing is not recorded in the facts; the resolution was the message being dropped and the task completing normally.
- **Vitest from the repo root fails on `.vue` imports** — the UI suite needs the UI vitest config. The engineer worked around it by running the affected test files directly; the full scoped `repoos check` covered the rest. Not fixed at the source and no task filed.
- **Queued/validating states were not verified in a browser.** No shots were declared (none required by the rules, since the change is text/state only), so a human has not yet eyeballed the new queued label in the pipeline summary.

## Learnings

- **A "started" field that falls back to an earlier timestamp hides the state it was meant to show.** The fallback looked harmless because the field was always set in the common path, but it was the only path for a job waiting behind the lock. Durable rule: snapshot fields should be null until the thing they describe has happened — this belongs in `AGENTS.md` or `docs/` (e.g. `docs/agent-workflow-rules.md` or an ADR on the integration pipeline), not just in this report.
- **Staleness and timers are different questions.** #0741 needed an enqueue time to judge stale failures; the timer needed the validating start. Mixing both in one helper made the timer inherit the staleness rule. Worth a note wherever `closeOutAttempt.ts`-style helpers are documented.
- **`attemptIsExecuting` checks only `startedAt`, not phase.** Today `startedAt` and the `queued → syncing` phase transition land in one atomic `updateJob` write, so the states can't diverge — but a future caller setting `startedAt` alone would classify a queued job as active. The reviewer suggested a code comment; that belongs in `integration-orchestrator.ts`/`integration-job.ts`.
- **Running vitest from the repo root fails on `.vue` imports**; the UI suite needs the UI config. Worth documenting in the testing conventions section of `AGENTS.md` or `user-docs/check.md` if it recurs.

## Follow-ups

None — no linked tasks were recorded and no follow-up tasks were filed from this task's issues. Two unfiled suggestions from the review remain open questions for the board: (1) investigate the separate `cardChecksDisplay` clock if the long "Checks" figure persists on a live run, and (2) add a small `state` fixture shot of the queued pipeline summary so the new queued label can be eyeballed in one click.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
