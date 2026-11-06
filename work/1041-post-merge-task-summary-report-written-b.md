---
id: 1041
title: Post-merge task summary report written by the PM agent
type: feature
status: review
needs_input: true
needs_input_reason: review-rounds-exhausted
needs_input_detail: "`needs some work` — summary-state persistence failures are hidden, and the required drawer view was not captured."
priority: p2
area: [core, web]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/post-merge-task-summary-report-written-b
review_cli_override: github copilot
created_at: "2026-11-06T04:37:35Z"
updated_at: "2026-11-06T13:36:24Z"
review_passes: 4
last_check_failure: "repoos check at 2026-11-06T09:20:05.482Z: repoos check failed: ui verification failed: timed out waiting for the task's browser capture"
review_rounds: 2
routing_switches: 1
routing_escalations: 1
review_timeout_retries: 0
handoff_signal_retry_count: 2
dev_error_count: 11
---
## Problem

When a task lands (Move to done), its story is scattered: the task file, one engineering report per round (`work/reports/<id>/round-<n>.json`), review passes (`review-<n>.md`), activity notes, and any follow-up tasks it spawned. Nobody gets a single account of what happened: how many dev/review rounds it took, which agents and models did the work, what went wrong, what was learned, and what new tasks came out of it. That knowledge lives in transcripts and is lost.

## Desired UX

Every task that merges to `done` successfully gets one **summary report** written after the merge, in the same area as the engineering and review reports (`work/reports/<id>/`, e.g. `summary.md`). It is written by the PM agent, in the background, after close-out, and never blocks or fails the landing.

What it covers (inputs: the task md, all engineering rounds, all review passes, the task's activity log, and its linked or follow-up tasks):
- **Outcome**: what shipped, in plain English, plus the final verdict.
- **Process stats**: dev/review rounds, wall-clock from start to done, agents and models used per role (engineer, reviewer, any restarts or swaps), token and cost totals where known.
- **What went wrong**: crashes, stalls, failed handoffs or gates, flaky checks, restarts, and how each was resolved.
- **Learnings**: things worth carrying forward. Durable ones should point to where they belong in the repo (AGENTS.md, `docs/`, an ADR) instead of living only in the report.
- **Follow-ups**: new tasks filed because of issues met along the way, with ids and one-line reasons.

## Constraints

- Length target: about 2,000 words at most, excluding the file-changes listing (the same convention the engineering report uses). Longer than a single round or review doc is fine; padding is not.
- Starts with `## TL;DR`, like the engineering reports.
- Generated from recorded facts (counts, models and dates come from the stored rounds, reviews and sessions); the PM agent writes the narrative and must not invent numbers.
- Idempotent: re-running for the same task overwrites or updates `summary.md`, never duplicates it.
- Committed as bookkeeping under the task's own report path, so landable/close-out treat it like the other report files (no task-scope drift).
- Every LLM call records usage in the `sessions` table (`recordOneShotSession`, a legible `sessionType`). Pick the agent through the budget allowlist.
- Visible: shown in the task drawer next to the engineering and review reports, and documented in `user-docs/engineering-reports.md`.

## Acceptance criteria

- After a successful Move to done, a summary job is queued and `work/reports/<id>/summary.md` appears without human action.
- A failed or slow summary never changes the task's `done` status or blocks the next landing; the failure is visible and retryable (`repoos summary <id>` or similar).
- The report passes a size check (about 2,000 words excluding file changes) and the `## TL;DR` check.
- Task drawer shows it; test covers generation, idempotency and the failure path; docs updated.
- Backfill is out of scope here, but the command should work on an already-done task so a few past ones can be tried by hand.

## Notes for AI

- Look at how the engineering report draft (`.repoos/engineering-report-drafts/<id>.md`) and its `## TL;DR` validation work, and at the close-out pipeline's post-merge hooks (`docs/close-out-pipeline.md`).
- Source: Nick, 2026-11-06.

## Activity

- 2026-11-06T04:37:35Z · created · njachowski@gmail.com
- 2026-11-06T04:37:35Z · needs_input
- 2026-11-06T04:37:39Z · body: Desired UX (added); Desired outcome (removed)
- 2026-11-06T04:48:38Z · needs_input
- 2026-11-06T04:54:12Z · status inbox→ready
- 2026-11-06T05:09:29Z · status ready→active, branch
- 2026-11-06T05:15:51Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: **Still missing:** server task-summary module, orchestrator hook, API routes + CLI + parity entries, drawer Summary block, `user-docs/engineering-reports.md` update, tests (generation, idempotency, failure path), and the scoped `repoos che… · stderr: muse: workspace root: /Users/nick/code/nick/repoos-worktrees/feat/post-merge-task-summary-report-written-b (cwd default) muse: workspace trust: trusted source=run-flag muse: warning: rules file at /Users/nick/code/nick/repoos-worktrees/feat/post-merge-task-summary-report-written-b/CLAUDE.md is ignored this session bec…
- 2026-11-06T05:29:37Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: Verification state: `REPOOS_CHECK_CHANGED=main repoos check` failed on one typecheck error (`Agent` not exported from `agents.js`); fixed by deriving `PmAgent` from the resolver return type. The scoped check has NOT been re-run green — nex… · stderr: muse: workspace root: /Users/nick/code/nick/repoos-worktrees/feat/post-merge-task-summary-report-written-b (cwd default) muse: workspace trust: trusted source=run-flag
- 2026-11-06T05:36:44Z · note: stopped orphaned engineer pid 30533
- 2026-11-06T05:36:45Z · agent exited with an error (muse) · received SIGTERM; flushed session logs
- 2026-11-06T05:36:45Z · engineer crash recovery: resuming muse + muse-spark-1.3 (1/3 crashes in 30m) · received SIGTERM; flushed session logs
- 2026-11-06T05:44:27Z · needs_input
- 2026-11-06T05:45:29Z · agent exited with an error (muse) · run ended with Failed: network connection could not be opened within 15 seconds (after 2 provider attempts)
- 2026-11-06T05:45:29Z · engineer crash recovery: resuming muse + muse-spark-1.3 (2/3 crashes in 30m) · run ended with Failed: network connection could not be opened within 15 seconds (after 2 provider attempts)
- 2026-11-06T05:45:32Z · needs_input
- 2026-11-06T05:53:26Z · body
- 2026-11-06T05:58:17Z · body
- 2026-11-06T06:01:43Z · CTO nudge: held — handoff gate is running
- 2026-11-06T06:26:44Z · status active→review
- 2026-11-06T06:26:45Z · message_queued at 2026-11-06T06:26:45.176Z
- 2026-11-06T06:39:55Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (6595e997d) during finalization (#0734)
- 2026-11-06T06:41:49Z · note: review pass 1: timed out after 15 minutes — no report (retrying once automatically)
- 2026-11-06T06:56:57Z · note: review pass 2: timed out after 15 minutes — no report; human needed
- 2026-11-06T06:56:58Z · needs_input
- 2026-11-06T07:06:51Z · review_cli_override
- 2026-11-06T07:06:59Z · needs_input (review-failed) cleared for review again by hello@repoos.org
- 2026-11-06T07:09:57Z · note: review pass 3: needs some work
- 2026-11-06T07:09:59Z · message_delivered: 1 message(s)
- 2026-11-06T07:09:59Z · status review→active
- 2026-11-06T07:21:48Z · body
- 2026-11-06T07:27:33Z · body
- 2026-11-06T07:31:43Z · CTO nudge: held — handoff gate is running
- 2026-11-06T07:33:16Z · message_queued at 2026-11-06T07:33:16.487Z
- 2026-11-06T07:33:19Z · message_delivered: 1 message(s)
- 2026-11-06T07:33:32Z · agent exited with an error (muse) · run ended with Failed: transport error: error sending request for url (https://api.meta.ai/v1/responses) (after 4 provider attempts)
- 2026-11-06T07:34:02Z · engineer crash recovery: resuming muse + muse-spark-1.3 (1/12 crashes in 30m) · run ended with Failed: transport error: error sending request for url (https://api.meta.ai/v1/responses) (after 4 provider attempts)
- 2026-11-06T07:34:05Z · needs_input
- 2026-11-06T07:34:17Z · agent exited with an error (muse) · run ended with Failed: transport error: error sending request for url (https://api.meta.ai/v1/responses) (after 4 provider attempts)
- 2026-11-06T07:44:31Z · watchdog: restarting engineer after 10m with no live process
- 2026-11-06T07:49:35Z · body
- 2026-11-06T07:55:00Z · body
- 2026-11-06T07:58:07Z · agent exited with an error (muse) · run ended with Failed: transport error: error sending request for url (https://api.meta.ai/v1/responses) (after 4 provider attempts)
- 2026-11-06T08:08:16Z · watchdog: restarting engineer after 10m with no live process
- 2026-11-06T08:08:32Z · agent exited with an error (muse) · run ended with Failed: transport error: error sending request for url (https://api.meta.ai/v1/responses) (after 4 provider attempts)
- 2026-11-06T08:18:46Z · watchdog: restarting engineer after 10m with no live process
- 2026-11-06T08:19:04Z · agent exited with an error (muse) · run ended with Failed: transport error: error sending request for url (https://api.meta.ai/v1/responses) (after 4 provider attempts)
- 2026-11-06T08:29:16Z · watchdog: restarting engineer after 10m with no live process
- 2026-11-06T08:29:33Z · agent exited with an error (muse) · run ended with Failed: transport error: error sending request for url (https://api.meta.ai/v1/responses) (after 4 provider attempts)
- 2026-11-06T08:39:46Z · watchdog: restarting engineer after 10m with no live process
- 2026-11-06T08:40:05Z · agent exited with an error (muse) · run ended with Failed: transport error: error sending request for url (https://api.meta.ai/v1/responses) (after 4 provider attempts)
- 2026-11-06T08:50:16Z · watchdog: restarting engineer after 10m with no live process
- 2026-11-06T08:50:34Z · agent exited with an error (muse) · run ended with Failed: transport error: error sending request for url (https://api.meta.ai/v1/responses) (after 4 provider attempts)
- 2026-11-06T09:00:46Z · watchdog: restarting engineer after 10m with no live process
- 2026-11-06T09:01:04Z · agent exited with an error (muse) · run ended with Failed: transport error: error sending request for url (https://api.meta.ai/v1/responses) (after 4 provider attempts)
- 2026-11-06T09:06:06Z · needs_input
- 2026-11-06T09:11:32Z · body
- 2026-11-06T09:15:40Z · status active→review
- 2026-11-06T09:19:34Z · note: review pass 4: needs some work
- 2026-11-06T09:19:35Z · message_queued at 2026-11-06T09:19:35.971Z
- 2026-11-06T09:19:36Z · status review→active
- 2026-11-06T09:19:38Z · CTO nudge: held — handoff gate is running
- 2026-11-06T09:20:02Z · message_queued at 2026-11-06T09:20:02.264Z
- 2026-11-06T09:20:05Z · message_delivered: 2 message(s)
- 2026-11-06T09:21:43Z · CTO nudge: held — remote validation is running
- 2026-11-06T09:27:19Z · body
- 2026-11-06T09:31:43Z · CTO nudge: held — handoff gate is running
- 2026-11-06T09:46:28Z · status active→review
- 2026-11-06T09:46:28Z · message_queued at 2026-11-06T09:46:28.795Z
- 2026-11-06T09:50:48Z · note: review pass 5: needs some work
- 2026-11-06T09:50:49Z · needs_input
- 2026-11-06T09:59:39Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (a40eef487) during finalization (#0734)
- 2026-11-06T10:51:39Z · status review→active
- 2026-11-06T10:51:42Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-06T10:51:47Z · message_overdue: still queued after 60m without being delivered
- 2026-11-06T10:51:47Z · message_delivered: 1 message(s)
- 2026-11-06T11:03:44Z · body
- 2026-11-06T11:11:45Z · CTO nudge: held — handoff gate is running
- 2026-11-06T11:24:21Z · status active→review
- 2026-11-06T11:24:22Z · message_queued at 2026-11-06T11:24:22.098Z
- 2026-11-06T11:27:10Z · note: review pass 6: needs some work
- 2026-11-06T11:27:10Z · needs_input
- 2026-11-06T11:27:10Z · needs_input
- 2026-11-06T11:38:11Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (a6c68ff14) during finalization (#0734)
- 2026-11-06T12:29:55Z · message_overdue: still queued after 60m without being delivered
- 2026-11-06T12:52:48Z · status review→active
- 2026-11-06T12:52:51Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-06T12:52:59Z · message_delivered: 1 message(s)
- 2026-11-06T13:13:59Z · body
- 2026-11-06T13:21:45Z · CTO nudge: held — handoff gate is running
- 2026-11-06T13:36:24Z · status active→review
