---
id: 1041
title: Post-merge task summary report written by the PM agent
type: feature
status: active
priority: p2
area: [core, web]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/post-merge-task-summary-report-written-b
created_at: "2026-11-06T04:37:35Z"
updated_at: "2026-11-06T05:36:44Z"
handoff_signal_retry_count: 2
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
